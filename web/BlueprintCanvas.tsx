import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Controls,
  MiniMap,
  PanOnScrollMode,
  ReactFlow,
  type Node,
  type Viewport,
} from "@xyflow/react";

import sample from "../samples/apex-bee.json";
import { BlueprintDocumentSchema } from "@schema/document.js";
import { indexForCanvas } from "@schema/canvas-index.js";
import { buildEdges } from "./edges";
import { computeLayout, type DiagramMode } from "./layout";
import { LAYOUT_MORPH_MS, useLayoutMorph } from "./useLayoutMorph";
import { StickyNode, type StickyData } from "./StickyNode";
import { computeGutterEmphasis } from "./gutterEmphasis";
import { SwimlaneGutter } from "./SwimlaneGutter";
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
  focusHold,
  nodeDisplayTier,
  previewOpacity,
  type DisplayTier,
  type PreviewPhase,
} from "./viewMode";
import { WorkflowRouteBar } from "./WorkflowRouteBar";
import { computeWorkflowPath, listWorkflowEventOptions } from "./workflowPath";

/** Match timeline full-board fitView floor so manual pinch does not snap after mode switch. */
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 1.5;

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
          className={diagramMode === "swimlane" ? "is-active" : ""}
          aria-pressed={diagramMode === "swimlane"}
          onClick={() => onSetDiagramMode("swimlane")}
        >
          Swimlanes
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
        {diagramMode === "swimlane"
          ? "EventStore streams · hover preview · click to open detail · M or dbl-click canvas switches to Timeline"
          : "One story spine with commands, views, and screens · M or dbl-click canvas switches to Swimlanes"}
      </div>
    </div>
  );
}

function cameraIntentForLayoutMorph(
  focusAnchorId: string | null,
): import("./sessionState").CameraIntent {
  if (focusAnchorId) {
    return { type: "FrameFocusClosure", anchorId: focusAnchorId };
  }
  return { type: "FrameStoryTimeline" };
}

function cameraIntentForPostMorph(
  mode: DiagramMode,
  focusAnchorId: string | null,
): import("./sessionState").CameraIntent {
  if (focusAnchorId) {
    return { type: "FrameFocusClosure", anchorId: focusAnchorId };
  }
  return mode === "timeline" ? { type: "FrameFullBoard" } : { type: "FrameStoryTimeline" };
}

function formatFocusLabel(doc: ReturnType<typeof BlueprintDocumentSchema.parse>, anchorId: string): string {
  const node = doc.nodes.find((n) => n.id === anchorId);
  if (!node) return anchorId;
  const kind =
    node.type === "command" ? "Command" : node.type === "view" ? "View" : node.type === "screen" ? "Screen" : "Event";
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
  const layout = useMemo(() => computeLayout(doc, diagramMode), [doc, diagramMode]);
  const { positions: displayPositions, isMorphing } = useLayoutMorph(layout.positions);
  const layoutCameraPending = useRef(false);
  const morphSyncCameraFired = useRef(false);
  const pendingTimelineFullFitRef = useRef(false);
  const diagramModeRef = useRef(diagramMode);
  diagramModeRef.current = diagramMode;

  /** Hide timeline stack + upper gutter bands until swimlane→timeline morph completes. */
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

  const { handleCameraIntent, restoreViewport, onMoveEnd } = useCameraController({
    doc,
    layout,
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    getFocusState: () =>
      focusStateRef.current ??
      sessionToFocusState(
        {
          board: {
            diagramMode: "swimlane",
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
        handleCameraIntent(cameraIntentForLayoutMorph(session.board.focusAnchorId), {
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

  const workflowEventOptions = useMemo(() => listWorkflowEventOptions(doc), [doc]);
  const workflowPath = useMemo(
    () => computeWorkflowPath(doc, workflowFromEventId, workflowToEventId),
    [doc, workflowFromEventId, workflowToEventId],
  );

  /** Disable hover only during story + focus-hold (no pinned slices). */
  const hoverPreviewEnabled = !(focusAnchorId !== null && openEventIds.size === 0);

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
    if (session.viewport) {
      restoreViewport(session.viewport);
    }
  }, [
    session.hydrated,
    session.viewport,
    session.board.diagramMode,
    session.board.workflowFromEventId,
    session.board.workflowToEventId,
    restoreViewport,
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
      if (next === "timeline" && diagramMode === "swimlane") {
        layoutMorphStartedRef.current = false;
        if (!prefersReducedMotion()) {
          setTimelineStackDeferred(true);
        }
      } else if (next === "swimlane") {
        layoutMorphStartedRef.current = false;
        setTimelineStackDeferred(false);
        pendingTimelineFullFitRef.current = false;
      }
      diagramModeRef.current = next;
      layoutCameraPending.current = true;
      morphSyncCameraFired.current = false;
      dispatch({ type: "SET_DIAGRAM_MODE", mode: next });
    },
    [clearHover, dispatch, diagramMode],
  );

  const gutterEmphasis = useMemo(
    () => computeGutterEmphasis(doc, layout.swimlaneRows, focusState, previewPhase),
    [doc, layout.swimlaneRows, focusState, previewPhase],
  );

  const onFlowMove = useCallback((_: unknown, viewport: Viewport) => {
    setFlowViewport(viewport);
  }, []);

  const toggleDiagramMode = useCallback(() => {
    beginDiagramModeChange(diagramMode === "swimlane" ? "timeline" : "swimlane");
  }, [beginDiagramModeChange, diagramMode]);

  const holdFocus = focusHold(focusState);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "m" && event.key !== "M") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
      event.preventDefault();
      toggleDiagramMode();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleDiagramMode]);

  const onBoardDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      const el = event.target as HTMLElement;
      if (el.closest(".react-flow__node")) return;
      if (el.closest(".react-flow__controls")) return;
      if (el.closest(".react-flow__minimap")) return;
      toggleDiagramMode();
    },
    [toggleDiagramMode],
  );

  const handleMoveEnd = useCallback(() => {
    onMoveEnd(setViewport);
  }, [onMoveEnd, setViewport]);

  const index = useMemo(() => indexForCanvas(doc), [doc]);

  const baseStickyNodes: Node[] = useMemo(
    () =>
      doc.nodes.map((n) => {
        const p = displayPositions.get(n.id) ?? { x: 0, y: 0 };
        let subtitle: string | undefined;
        if (n.type === "command" && n.rejections.length)
          subtitle = `${n.rejections.length} rejection(s)`;
        const isFocusAnchor = focusAnchorId !== null && n.id === focusAnchorId;
        const onWorkflowRoute =
          workflowPath.status === "valid" && workflowPath.eventIds.has(n.id) && n.type === "event";
        return {
          id: n.id,
          type: "sticky",
          position: p,
          zIndex: isFocusAnchor ? 5 : onWorkflowRoute ? 4 : 2,
          className: "nopan",
          data: {
            kind: n.type,
            name: n.name,
            subtitle,
            isFocusAnchor,
            onWorkflowRoute,
          } satisfies StickyData,
        };
      }),
    [doc.nodes, displayPositions, focusAnchorId, workflowPath],
  );

  const allEdges = useMemo(
    () =>
      buildEdges(doc, displayPositions, {
        includeStreamEdges: diagramMode === "swimlane",
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
    diagramMode === "timeline" ||
    openEventIds.size > 0 ||
    hoverExpandedId !== null ||
    focusAnchorId !== null;

  const metaLine =
    diagramMode === "timeline"
      ? focusAnchorId
        ? `Timeline · focus — ${formatFocusLabel(doc, focusAnchorId)}`
        : openEventIds.size > 0
          ? `Timeline · ${openEventIds.size} open slice(s)`
          : "Timeline — full event-model stack on one story spine"
      : workflowPath.status === "valid"
        ? `Workflow route — ${workflowPath.eventIds.size} events highlighted`
        : focusAnchorId
          ? holdFocus
            ? `Swimlanes · focus — ${formatFocusLabel(doc, focusAnchorId)}`
            : `Swimlanes · focus — ${formatFocusLabel(doc, focusAnchorId)} · ${openEventIds.size} open slice(s)`
          : openEventIds.size > 0
            ? `Swimlanes · ${openEventIds.size} open slice(s) · click an event to focus`
            : "Swimlanes — one row per EventStore pattern · hover for preview · click an event for detail";

  return (
    <>
      <header className="app-header">
        <div>
          <h1>{index.meta.name}</h1>
          <div className="meta">{metaLine}</div>
        </div>
        <BoardControls diagramMode={diagramMode} onSetDiagramMode={beginDiagramModeChange} />
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
          </div>
        ) : null}
      </header>
      <div className="app-body">
        {diagramMode === "swimlane" ? (
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
          className={`canvas-wrap canvas-wrap--${diagramMode}`}
          ref={canvasRef}
          onDoubleClick={onBoardDoubleClick}
        >
        <div ref={gutterRef} className="lane-gutter-host">
          <SwimlaneGutter
            rows={layout.swimlaneRows}
            viewport={flowViewport}
            gutterHeight={gutterHeight}
            emphasis={gutterEmphasis}
            showAll={gutterExpanded}
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
