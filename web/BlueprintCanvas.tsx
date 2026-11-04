import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Controls,
  MiniMap,
  PanOnScrollMode,
  Position,
  ReactFlow,
  type Node,
  type Viewport,
} from "@xyflow/react";

import sample from "../samples/apex-bee.json";
import { BlueprintDocumentSchema } from "@schema/document.js";
import { indexForCanvas } from "@schema/canvas-index.js";
import { buildEdges } from "./edges";
import { computeLayout, type DiagramMode } from "./layout";
import { NODE_H, NODE_W } from "./layoutMetrics";
import { packLayout, type NodeSize } from "./packLayout";
import { LAYOUT_MORPH_MS, useLayoutMorph } from "./useLayoutMorph";
import { StickyNode, type StickyData } from "./StickyNode";
import { computeGutterEmphasis } from "./gutterEmphasis";
import { StreamGutter } from "./StreamGutter";
import { usePinchZoom } from "./usePinchZoom";
import { useHoverPreview } from "./useHoverPreview";
import { useBlueprintSession } from "./useBlueprintSession";
import { useCameraController } from "./useCameraController";
import { useStickyClickDispatch } from "./useStickyClick";
import { sessionToFocusState } from "./sessionState";
import {
  CONTEXT_OPACITY,
  WORKFLOW_OFF_PATH_OPACITY,
  edgeDisplayTier,
  edgeShouldAnimate,
  nodeDisplayTier,
  previewOpacity,
  type DisplayTier,
  type PreviewPhase,
} from "./viewMode";
import { WorkflowRouteBar } from "./WorkflowRouteBar";
import { narrativeSpanOf, storyIndexByEventId } from "../src/narrativeOrder.js";
import { computeTimelineRange, listWorkflowEventOptions, timelineSelectionPath } from "./workflowPath";
import { nextDiagramMode } from "./diagramMode";
import { streamViewportLooksStale } from "./streamStoryCamera";
import { BAND_LABEL_DESIGN_UI } from "./streamLabels";

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 1.5;
const HANDLE_SIZE = 7;

const getFlowPaneSizeFromCanvas = (root: HTMLDivElement | null) => {
  const host = root?.querySelector(".react-flow__renderer") as HTMLElement | null;
  return { width: host?.clientWidth ?? 800, height: host?.clientHeight ?? 600 };
};

/** Explicit handle bounds so edges keep endpoints when node object identity churns. */
function stickyHandles(width: number, height: number) {
  const hw = HANDLE_SIZE;
  const hh = HANDLE_SIZE;
  const cx = width / 2 - hw / 2;
  const cy = height / 2 - hh / 2;
  return [
    { id: "t-in", type: "target" as const, position: Position.Top, x: cx, y: -hh / 2, width: hw, height: hh },
    { id: "t-out", type: "source" as const, position: Position.Top, x: cx, y: -hh / 2, width: hw, height: hh },
    { id: "b-in", type: "target" as const, position: Position.Bottom, x: cx, y: height - hh / 2, width: hw, height: hh },
    { id: "b-out", type: "source" as const, position: Position.Bottom, x: cx, y: height - hh / 2, width: hw, height: hh },
    { id: "l-in", type: "target" as const, position: Position.Left, x: -hw / 2, y: cy, width: hw, height: hh },
    { id: "r-out", type: "source" as const, position: Position.Right, x: width - hw / 2, y: cy, width: hw, height: hh },
  ];
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

const nodeTypes = {
  sticky: StickyNode,
};

function tierStrokeOpacity(
  tier: DisplayTier,
  previewPhase: PreviewPhase,
  base: number,
  workflowDim: boolean,
): number {
  if (tier === "context") return (workflowDim ? WORKFLOW_OFF_PATH_OPACITY : CONTEXT_OPACITY) * base;
  if (tier === "preview") return Math.min(0.48, previewOpacity(previewPhase) * base);
  return base;
}

const WORKFLOW_ROUTE_STROKE = "#5b9bf5";

function BoardControls({
  diagramMode,
  onSetDiagramMode,
}: {
  diagramMode: DiagramMode;
  onSetDiagramMode: (mode: DiagramMode) => void;
}) {
  return (
    <div className="app-header-actions">
      <div className="view-mode-toggle" role="group" aria-label="Diagram layout">
        <button
          type="button"
          className={diagramMode === "design" ? "is-active" : ""}
          aria-pressed={diagramMode === "design"}
          onClick={() => onSetDiagramMode("design")}
        >
          Design
        </button>
        <button
          type="button"
          className={diagramMode === "stream" ? "is-active" : ""}
          aria-pressed={diagramMode === "stream"}
          onClick={() => onSetDiagramMode("stream")}
        >
          Streams
        </button>
        <button
          type="button"
          className={diagramMode === "timeline" ? "is-active" : ""}
          aria-pressed={diagramMode === "timeline"}
          onClick={() => onSetDiagramMode("timeline")}
        >
          Timeline
        </button>
      </div>
      <div className="view-mode-hint">
        {diagramMode === "design"
          ? "User categories and screens · M or double-click canvas → Streams"
          : diagramMode === "stream"
            ? "Click an event or a stream to mark it · Timeline shows that slice · M or double-click → Timeline"
            : "One story spine · From and To dim events outside the range · M or double-click → Design"}
      </div>
    </div>
  );
}

function cameraIntentForLayoutMorph(
  mode: DiagramMode,
  focusAnchorId: string | null,
): import("./sessionState").CameraIntent {
  if (focusAnchorId) {
    return { type: "FrameFocusClosure", anchorId: focusAnchorId };
  }
  if (mode === "design") return { type: "FrameDesignBoard" };
  if (mode === "timeline") return { type: "FrameStoryTimeline" };
  return { type: "FrameStoryTimeline" };
}

function cameraIntentForPostMorph(
  mode: DiagramMode,
  focusAnchorId: string | null,
): import("./sessionState").CameraIntent {
  if (focusAnchorId) {
    return { type: "FrameFocusClosure", anchorId: focusAnchorId };
  }
  if (mode === "design") return { type: "FrameDesignBoard" };
  if (mode === "timeline") return { type: "FrameFullBoard" };
  return { type: "FrameStoryTimeline" };
}

function formatFocusLabel(doc: ReturnType<typeof BlueprintDocumentSchema.parse>, anchorId: string): string {
  const node = doc.nodes.find((n) => n.id === anchorId);
  if (!node) return anchorId;
  const kind =
    node.type === "command"
      ? "Command"
      : node.type === "view"
        ? "View"
        : node.type === "screen"
          ? "Screen"
          : node.type === "trigger"
            ? "Trigger"
            : node.type === "automation"
              ? "Automation"
              : "Event";
  return `${kind} — ${node.name}`;
}

export function BlueprintCanvas() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const viewportRestored = useRef(false);

  const doc = useMemo(() => BlueprintDocumentSchema.parse(sample), []);

  const cameraIntentRef = useRef<((intent: import("./sessionState").CameraIntent) => void) | null>(null);
  const { session, dispatch, setViewport } = useBlueprintSession((intent) => {
    cameraIntentRef.current?.(intent);
  });

  const diagramMode = session.board.diagramMode;
  const timelineRange = useMemo(() => {
    const from = session.board.workflowFromEventId;
    const to = session.board.workflowToEventId;
    const selected = session.board.openEventIds;
    if (diagramMode === "timeline" && selected.length > 0) {
      const marked = narrativeSpanOf(doc, selected);
      if (marked && marked.from === from && marked.to === to) {
        return timelineSelectionPath(doc, selected);
      }
    }
    return computeTimelineRange(doc, from, to);
  }, [
    doc,
    diagramMode,
    session.board.workflowFromEventId,
    session.board.workflowToEventId,
    session.board.openEventIds,
  ]);
  const layout = useMemo(() => computeLayout(doc, diagramMode), [doc, diagramMode]);
  const { positions: morphPositions, isMorphing } = useLayoutMorph(layout.positions);
  const [nodeSizes, setNodeSizes] = useState<Map<string, NodeSize>>(() => new Map());
  const onMeasuredSize = useCallback((nodeId: string, size: NodeSize) => {
    setNodeSizes((prev) => {
      const cur = prev.get(nodeId);
      if (
        cur &&
        Math.round(cur.width) === Math.round(size.width) &&
        Math.round(cur.height) === Math.round(size.height)
      ) {
        return prev;
      }
      const next = new Map(prev);
      next.set(nodeId, {
        width: Math.round(size.width),
        height: Math.round(size.height),
      });
      return next;
    });
  }, []);
  const packed = useMemo(() => {
    // During mode morph, keep base geometry so incomplete interpolations are not re-binned into lanes.
    if (isMorphing) {
      return { positions: morphPositions, streamRows: layout.streamRows };
    }
    return packLayout({ positions: morphPositions, streamRows: layout.streamRows }, nodeSizes);
  }, [isMorphing, morphPositions, layout.streamRows, nodeSizes]);
  const displayPositions = packed.positions;
  const displayStreamRows = packed.streamRows;
  const layoutCameraPending = useRef(false);
  const morphSyncCameraFired = useRef(false);
  const pendingTimelineFullFitRef = useRef(false);
  const diagramModeRef = useRef(diagramMode);
  diagramModeRef.current = diagramMode;

  /** Hide timeline stack + upper gutter bands until stream→timeline morph completes. */
  const [timelineStackDeferred, setTimelineStackDeferred] = useState(false);
  const layoutMorphStartedRef = useRef(false);

  useEffect(() => {
    if (!timelineStackDeferred) return;
    if (isMorphing) {
      layoutMorphStartedRef.current = true;
      return;
    }
    if (!layoutMorphStartedRef.current) return;
    layoutMorphStartedRef.current = false;
    setTimelineStackDeferred(false);
  }, [isMorphing, timelineStackDeferred]);

  const [flowViewport, setFlowViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const [gutterHeight, setGutterHeight] = useState(600);
  const gutterRef = useRef<HTMLDivElement>(null);

  const focusStateRef = useRef<ReturnType<typeof sessionToFocusState> | null>(null);
  const previewPhaseRef = useRef<PreviewPhase>("idle");

  const getFlowPaneSize = useCallback(
    () => getFlowPaneSizeFromCanvas(canvasRef.current),
    [],
  );

  const { handleCameraIntent, restoreViewport, onMoveEnd } = useCameraController({
    doc,
    layout,
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    getFlowPaneSize,
    getFocusState: () =>
      focusStateRef.current ??
      sessionToFocusState(
        {
          board: {
            diagramMode: "design",
            showAll: false,
            openEventIds: [],
            openOrder: [],
            focusAnchorId: null,
            workflowFromEventId: null,
            workflowToEventId: null,
          },
          viewport: null,
          hydrated: true,
        },
        null,
      ),
    getPreviewPhase: () => previewPhaseRef.current,
  });

  useEffect(() => {
    cameraIntentRef.current = handleCameraIntent;
  }, [handleCameraIntent]);

  useEffect(() => {
    if (!layoutCameraPending.current) return;

    if (isMorphing) {
      if (!morphSyncCameraFired.current) {
        morphSyncCameraFired.current = true;
        const mode = diagramModeRef.current;
        handleCameraIntent(cameraIntentForLayoutMorph(mode, session.board.focusAnchorId), {
          duration: prefersReducedMotion() ? 0 : LAYOUT_MORPH_MS,
          debounce: false,
        });
      }
      return;
    }

    layoutCameraPending.current = false;
    const mode = diagramModeRef.current;
    const anchorId = session.board.focusAnchorId;

    if (mode === "timeline") {
      if (anchorId) {
        if (!morphSyncCameraFired.current) {
          handleCameraIntent({ type: "FrameFocusClosure", anchorId });
        }
        return;
      }
      pendingTimelineFullFitRef.current = true;
      return;
    }

    if (!morphSyncCameraFired.current) {
      handleCameraIntent(cameraIntentForPostMorph(mode, anchorId));
    }
  }, [isMorphing, handleCameraIntent, session.board.focusAnchorId]);

  useEffect(() => {
    if (!pendingTimelineFullFitRef.current) return;
    if (diagramMode !== "timeline") return;
    if (timelineStackDeferred) return;
    if (session.board.focusAnchorId) return;
    pendingTimelineFullFitRef.current = false;
    handleCameraIntent({ type: "FrameFullBoard" });
  }, [
    diagramMode,
    timelineStackDeferred,
    handleCameraIntent,
    session.board.focusAnchorId,
  ]);

  const { openEventIds, focusAnchorId, workflowFromEventId, workflowToEventId } = {
    openEventIds: new Set(session.board.openEventIds),
    focusAnchorId: session.board.focusAnchorId,
    workflowFromEventId: session.board.workflowFromEventId,
    workflowToEventId: session.board.workflowToEventId,
  };

  const workflowEventOptions = useMemo(() => {
    const index = storyIndexByEventId(doc);
    return listWorkflowEventOptions(doc).sort(
      (a, b) => (index.get(a.id) ?? 0) - (index.get(b.id) ?? 0),
    );
  }, [doc]);
  const workflowPath = timelineRange;

  /** Disable hover only during story + focus-hold (no pinned slices). */
  const hoverPreviewEnabled =
    diagramMode === "timeline" && !(focusAnchorId !== null && openEventIds.size === 0);

  const eventTargets = useMemo(
    () =>
      doc.nodes
        .filter((n) => n.type === "event")
        .map((n) => ({
          id: n.id,
          position: displayPositions.get(n.id) ?? { x: 0, y: 0 },
        })),
    [doc.nodes, displayPositions],
  );

  const {
    hoverExpandedId,
    previewPhase,
    onPaneMouseMove,
    onPaneMouseLeave,
    clearHover,
  } = useHoverPreview(doc, displayPositions, eventTargets, hoverPreviewEnabled);

  previewPhaseRef.current = previewPhase;

  const focusState = useMemo(
    () => ({
      ...sessionToFocusState(session, hoverExpandedId),
      timelineStackDeferred,
      workflowPath,
    }),
    [session, hoverExpandedId, timelineStackDeferred, workflowPath],
  );
  focusStateRef.current = focusState;

  usePinchZoom(canvasRef, { minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM });

  useEffect(() => {
    if (!session.hydrated || viewportRestored.current) return;
    viewportRestored.current = true;
    if (session.board.workflowFromEventId && session.board.workflowToEventId) {
      return;
    }
    if (session.board.diagramMode === "timeline") {
      return;
    }
    if (session.board.diagramMode === "design") {
      if (session.viewport) restoreViewport(session.viewport);
      else handleCameraIntent({ type: "FrameDesignBoard" });
      return;
    }
    if (session.viewport) {
      const { height } = getFlowPaneSizeFromCanvas(canvasRef.current);
      if (
        streamViewportLooksStale(
          session.viewport.zoom,
          layout,
          doc,
          height,
          MIN_ZOOM,
          MAX_ZOOM,
        )
      ) {
        handleCameraIntent({ type: "FrameStoryTimeline" });
      } else {
        restoreViewport(session.viewport);
      }
    }
  }, [
    session.hydrated,
    session.viewport,
    session.board.diagramMode,
    session.board.workflowFromEventId,
    session.board.workflowToEventId,
    doc,
    layout,
    restoreViewport,
    handleCameraIntent,
  ]);

  useEffect(() => {
    const el = gutterRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setGutterHeight(el.clientHeight);
    });
    ro.observe(el);
    setGutterHeight(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  const gutterExpanded = diagramMode === "timeline" && !timelineStackDeferred;

  const beginDiagramModeChange = useCallback(
    (next: DiagramMode) => {
      if (next === diagramMode) return;
      clearHover();
      const span =
        next === "timeline" && session.board.openEventIds.length > 0
          ? narrativeSpanOf(doc, session.board.openEventIds)
          : null;
      if (next === "timeline" && (diagramMode === "stream" || diagramMode === "design")) {
        layoutMorphStartedRef.current = false;
        if (!prefersReducedMotion()) {
          setTimelineStackDeferred(true);
        }
      } else if (next !== "timeline") {
        layoutMorphStartedRef.current = false;
        setTimelineStackDeferred(false);
        pendingTimelineFullFitRef.current = false;
      }
      diagramModeRef.current = next;
      layoutCameraPending.current = true;
      morphSyncCameraFired.current = false;
      dispatch({
        type: "SET_DIAGRAM_MODE",
        mode: next,
        ...(span
          ? { workflowFromEventId: span.from, workflowToEventId: span.to }
          : {}),
      });
    },
    [clearHover, dispatch, diagramMode, doc, session.board.openEventIds],
  );

  const gutterEmphasis = useMemo(
    () => computeGutterEmphasis(doc, displayStreamRows, focusState, previewPhase),
    [doc, displayStreamRows, focusState, previewPhase],
  );

  const onFlowMove = useCallback((_: unknown, viewport: Viewport) => {
    setFlowViewport(viewport);
  }, []);

  const cycleDiagramMode = useCallback(() => {
    beginDiagramModeChange(nextDiagramMode(diagramMode));
  }, [beginDiagramModeChange, diagramMode]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "m" && event.key !== "M") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
      event.preventDefault();
      cycleDiagramMode();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cycleDiagramMode]);

  const onBoardDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      const el = event.target as HTMLElement;
      if (el.closest(".react-flow__node")) return;
      if (el.closest(".react-flow__controls")) return;
      if (el.closest(".react-flow__minimap")) return;
      if (el.closest(".lane-gutter-host")) return;
      const gutter = gutterRef.current?.getBoundingClientRect();
      if (
        gutter &&
        event.clientX >= gutter.left &&
        event.clientX <= gutter.right &&
        event.clientY >= gutter.top &&
        event.clientY <= gutter.bottom
      ) {
        return;
      }
      cycleDiagramMode();
    },
    [cycleDiagramMode],
  );

  const handleMoveEnd = useCallback(() => {
    onMoveEnd(setViewport);
  }, [onMoveEnd, setViewport]);

  const index = useMemo(() => indexForCanvas(doc), [doc]);

  const baseStickyNodes: Node[] = useMemo(
    () => {
      const streamNameById = new Map(doc.streams.map((s) => [s.id, s.name]));
      const titleCase = (value: string) =>
        value.replace(/(^|\s)(\S)/g, (_lead, space: string, ch: string) => space + ch.toUpperCase());
      const nodeById = new Map(doc.nodes.map((node) => [node.id, node]));
      const commandStreamLabel = (commandId: string): string | undefined => {
        const streamIds = new Set<string>();
        for (const edge of doc.edges) {
          if (edge.rel !== "produces" || edge.from !== commandId) continue;
          const produced = nodeById.get(edge.to);
          if (produced?.type === "event") streamIds.add(produced.streamId);
        }
        if (streamIds.size !== 1) return undefined;
        return streamNameById.get([...streamIds][0]!);
      };
      const viewUiStreamLabel = (viewId: string): string | undefined => {
        for (const edge of doc.edges) {
          if (edge.rel !== "rendersOn" || edge.from !== viewId) continue;
          const ui = nodeById.get(edge.to);
          if (ui && (ui.type === "screen" || ui.type === "trigger")) {
            return streamNameById.get(ui.streamId);
          }
        }
        return undefined;
      };
      return doc.nodes.map((n) => {
        const p = displayPositions.get(n.id) ?? { x: 0, y: 0 };
        let timelineEvent =
          diagramMode === "timeline" &&
          (n.type === "event" || n.type === "trigger" || n.type === "command" || n.type === "screen");
        let subtitle: string | undefined;
        let streamTitle: string | undefined;
        if (timelineEvent && (n.type === "event" || n.type === "trigger" || n.type === "screen")) {
          const streamName = streamNameById.get(n.streamId);
          streamTitle = streamName ? titleCase(streamName) : undefined;
        } else if (timelineEvent && n.type === "command") {
          const streamName = commandStreamLabel(n.id);
          streamTitle = streamName ? titleCase(streamName) : undefined;
        } else if (diagramMode === "timeline" && n.type === "view") {
          const streamName = viewUiStreamLabel(n.id) ?? streamNameById.get(n.streamId);
          if (streamName) {
            timelineEvent = true;
            streamTitle = titleCase(streamName);
          }
        } else if (n.type === "command" && n.rejections.length) {
          subtitle = `${n.rejections.length} rejection(s)`;
        } else if (diagramMode === "timeline" && n.type === "automation") {
          subtitle = streamNameById.get(n.streamId);
        }
        const isFocusAnchor = focusAnchorId !== null && n.id === focusAnchorId;
        const onWorkflowRoute =
          workflowPath.status === "valid" && workflowPath.eventIds.has(n.id) && n.type === "event";
        const selected =
          diagramMode === "stream" && n.type === "event" && openEventIds.has(n.id);
        // Seed size + handles so React Flow can place edges without DOM measurement.
        // Node object identity churns on focus/hover; without measured/handles, adoptUserNodes
        // clears handleBounds and every edge endpoint becomes null → empty edge layer.
        const size = nodeSizes.get(n.id);
        const width = size?.width ?? NODE_W;
        const height = size?.height ?? NODE_H;
        return {
          id: n.id,
          type: "sticky",
          position: p,
          // measured + handles only — avoid width/height so expanded stickies are not clipped.
          measured: { width, height },
          handles: stickyHandles(width, height),
          zIndex: isFocusAnchor ? 5 : onWorkflowRoute ? 4 : 2,
          className: "nopan",
          data: {
            kind: n.type,
            name: n.name,
            subtitle,
            streamTitle,
            timelineEvent,
            fields:
              diagramMode === "timeline" &&
              (n.type === "event" || n.type === "trigger" || n.type === "command") &&
              "fields" in n &&
              n.fields?.length
                ? n.fields
                : diagramMode === "timeline" && n.type === "view" && n.fields.length
                  ? n.fields.map((field) => ({
                      name: field.name,
                      type: field.type,
                      description:
                        field.source.kind === "fromEvent"
                          ? `From ${field.source.eventId}.${field.source.field}.`
                          : field.source.kind === "derived"
                            ? field.source.note ?? "Derived for this view."
                            : field.source.kind === "user"
                              ? "Supplied by the user."
                              : field.source.kind === "generated"
                                ? "Generated value."
                                : field.source.note ?? "External value.",
                    }))
                  : undefined,
            apiClientResponse:
              diagramMode === "timeline" &&
              n.type === "command" &&
              n.apiClientResponse?.length
                ? n.apiClientResponse
                : undefined,
            onMeasuredSize,
            isFocusAnchor,
            onWorkflowRoute,
            selected,
            external: n.type === "trigger" && Boolean(n.external),
            parents:
              n.type === "trigger" && n.parents?.length ? n.parents : undefined,
          } satisfies StickyData,
        };
      });
    },
    [
      doc.nodes,
      doc.streams,
      doc.edges,
      displayPositions,
      focusAnchorId,
      workflowPath,
      diagramMode,
      openEventIds,
      onMeasuredSize,
      nodeSizes,
    ],
  );

  const allEdges = useMemo(
    () =>
      buildEdges(doc, displayPositions, {
        includeStreamEdges: diagramMode === "stream",
        includeEmEdges: diagramMode !== "design",
      }),
    [doc, displayPositions, diagramMode],
  );

  const nodes = useMemo(() => {
    return baseStickyNodes.map((n) => {
      const displayTier = nodeDisplayTier(doc, n.id, focusState, previewPhase);
      return {
        ...n,
        data: {
          ...(n.data as StickyData),
          displayTier,
          previewPhase,
        },
      };
    });
  }, [baseStickyNodes, doc, focusState, previewPhase]);

  const edges = useMemo(() => {
    const workflowActive = workflowPath.status === "valid";
    return allEdges.map((e) => {
      const tier = edgeDisplayTier(doc, e.id, focusState, previewPhase);
      const baseOp = typeof e.style?.opacity === "number" ? e.style.opacity : 0.95;
      const isRouteEdge = workflowActive && workflowPath.edgeIds.has(e.id);

      if (tier === "hidden") {
        return { ...e, hidden: true };
      }

      const workflowDim = workflowActive && !isRouteEdge;
      const strokeOp = tierStrokeOpacity(tier, previewPhase, baseOp, workflowDim);
      const animate = edgeShouldAnimate(doc, e.id, focusState, previewPhase);

      const classNames = [
        tier === "preview" || tier === "context" ? "preview-edge" : "",
        isRouteEdge ? "workflow-route-edge" : "",
      ]
        .filter(Boolean)
        .join(" ");

      return {
        ...e,
        hidden: false,
        animated: animate,
        zIndex: isRouteEdge ? 8 : e.zIndex,
        className: classNames || undefined,
        style: {
          ...e.style,
          stroke: isRouteEdge ? WORKFLOW_ROUTE_STROKE : e.style?.stroke,
          strokeWidth: isRouteEdge ? 3 : e.style?.strokeWidth,
          opacity: isRouteEdge ? 1 : strokeOp,
          transition: "opacity 0.22s ease, stroke 0.22s ease",
        },
      };
    });
  }, [allEdges, doc, focusState, previewPhase, workflowPath]);

  const onEventClickToggle = useCallback(
    (eventId: string) => {
      clearHover();
      dispatch({ type: "EVENT_CLICK", eventId });
    },
    [clearHover, dispatch],
  );

  const onFocusAnchorToggle = useCallback(
    (nodeId: string) => {
      clearHover();
      dispatch({ type: "FOCUS_ANCHOR_TOGGLE", nodeId });
    },
    [clearHover, dispatch],
  );

  const { onNodeClick, onNodeDoubleClick } = useStickyClickDispatch({
    previewPhase,
    onEventClick: onEventClickToggle,
    onFocusAnchorToggle,
  });

  const showLegend =
    diagramMode !== "design" &&
    (diagramMode === "timeline" ||
      openEventIds.size > 0 ||
      hoverExpandedId !== null ||
      focusAnchorId !== null);

  const metaLine =
    diagramMode === "design"
      ? "Design — screens by user category (double-click canvas to cycle views)"
      : diagramMode === "timeline"
        ? workflowPath.status === "valid"
          ? `Timeline · ${workflowPath.eventIds.size} events in range`
          : focusAnchorId
            ? `Timeline · focus — ${formatFocusLabel(doc, focusAnchorId)}`
            : openEventIds.size > 0
              ? `Timeline · ${openEventIds.size} open slice(s)`
              : "Timeline — full event-model stack on one story spine"
        : workflowPath.status === "valid"
          ? `Workflow route — ${workflowPath.eventIds.size} events highlighted`
            : openEventIds.size > 0
              ? `Streams · ${openEventIds.size} selected for Timeline`
              : "Streams — click an event or a stream to mark a Timeline slice";

  const selectedStreamIds = useMemo(() => {
    const ids = new Set<string>();
    if (diagramMode !== "stream") return ids;
    for (const n of doc.nodes) {
      if (n.type === "event" && openEventIds.has(n.id)) ids.add(n.streamId);
    }
    return ids;
  }, [diagramMode, doc.nodes, openEventIds]);

  const onSelectStream = useCallback(
    (streamId: string) => {
      const eventIds = doc.nodes
        .filter((n) => n.type === "event" && n.streamId === streamId)
        .map((n) => n.id);
      dispatch({ type: "TOGGLE_STREAM_SELECTION", eventIds });
    },
    [dispatch, doc.nodes],
  );

  return (
    <>
      <header className="app-header">
        <div>
          <h1>{index.meta.name}</h1>
          <div className="meta">{metaLine}</div>
        </div>
        <div className="app-header-end">
          {showLegend ? (
            <div className="legend">
              <span>
                <i style={{ background: "#f5c542" }} /> event
              </span>
              <span>
                <i style={{ background: "#4a8fd4" }} /> command
              </span>
              <span>
                <i style={{ background: "#5cb85c" }} /> view
              </span>
              <span>
                <i style={{ background: "#eceff4" }} /> screen
              </span>
              <span>
                <i style={{ background: "#c5d4e8" }} /> trigger
              </span>
              <span>
                <i style={{ background: "#e7dcc6" }} /> automation
              </span>
            </div>
          ) : null}
          <BoardControls diagramMode={diagramMode} onSetDiagramMode={beginDiagramModeChange} />
        </div>
      </header>
      <div className="app-body">
        {diagramMode === "timeline" ? (
          <WorkflowRouteBar
            options={workflowEventOptions}
            fromEventId={workflowFromEventId}
            toEventId={workflowToEventId}
            path={workflowPath}
            onSetFrom={(eventId) => dispatch({ type: "WORKFLOW_SET_FROM", eventId })}
            onSetTo={(eventId) => dispatch({ type: "WORKFLOW_SET_TO", eventId })}
            onClear={() => dispatch({ type: "WORKFLOW_CLEAR" })}
          />
        ) : null}
        <div
          className={`canvas-wrap canvas-wrap--${diagramMode}${isMorphing ? " canvas-wrap--morphing" : ""}`}
          ref={canvasRef}
          onDoubleClick={onBoardDoubleClick}
        >
        <div
          ref={gutterRef}
          className="lane-gutter-host"
          onDoubleClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <StreamGutter
            rows={displayStreamRows}
            viewport={flowViewport}
            gutterHeight={gutterHeight}
            emphasis={gutterEmphasis}
            showAll={gutterExpanded}
            bandLabelOverrides={diagramMode === "design" ? { ui: BAND_LABEL_DESIGN_UI } : undefined}
            hideBandLabels={diagramMode === "timeline"}
            selectedStreamIds={selectedStreamIds}
            onSelectStream={diagramMode === "stream" ? onSelectStream : undefined}
          />
        </div>
        <div className="react-flow-host">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            minZoom={MIN_ZOOM}
            maxZoom={MAX_ZOOM}
            nodesDraggable={false}
            nodesConnectable={false}
            defaultEdgeOptions={{ type: "default" }}
            zoomOnScroll={false}
            zoomOnPinch={false}
            zoomOnDoubleClick={false}
            panOnScroll
            panOnScrollMode={PanOnScrollMode.Free}
            panOnScrollSpeed={0.75}
            onPaneMouseMove={onPaneMouseMove}
            onPaneMouseLeave={onPaneMouseLeave}
            onNodeClick={onNodeClick}
            onNodeDoubleClick={onNodeDoubleClick}
            onMove={onFlowMove}
            onMoveEnd={handleMoveEnd}
            onInit={(instance) => setFlowViewport(instance.getViewport())}
            noPanClassName="nopan"
          >
            <Background color="#1e2a3a" gap={24} size={1.2} />
            <Controls showInteractive={false} />
            <MiniMap
              nodeColor={(n) => {
                const k = (n.data as { kind?: string }).kind;
                if (k === "event") return "#f5c542";
                if (k === "command") return "#4a8fd4";
                if (k === "view") return "#5cb85c";
                if (k === "screen") return "#eceff4";
                if (k === "trigger") return "#c5d4e8";
                if (k === "automation") return "#e7dcc6";
                return "#243044";
              }}
              maskColor="rgba(15, 20, 25, 0.88)"
              pannable
              zoomable
            />
          </ReactFlow>
        </div>
        </div>
      </div>
    </>
  );
}
