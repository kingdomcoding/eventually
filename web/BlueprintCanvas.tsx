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
import { computeLayout } from "./layout";
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

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 1.5;

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
  showAll,
  storyMode,
  onShowAll,
  onEventsOnly,
}: {
  showAll: boolean;
  storyMode: boolean;
  onShowAll: () => void;
  onEventsOnly: () => void;
}) {
  return (
    <div className="app-header-actions">
      <div className="view-mode-toggle" role="group" aria-label="Diagram view">
        <button
          type="button"
          className={storyMode ? "is-active" : ""}
          aria-pressed={storyMode}
          onClick={onEventsOnly}
        >
          Story
        </button>
        <button
          type="button"
          className={showAll ? "is-active" : ""}
          aria-pressed={showAll}
          onClick={onShowAll}
        >
          Show all
        </button>
      </div>
      <div className="view-mode-hint">
        Hover preview · click event to open &amp; focus · click command/view/screen to focus · dbl-click canvas or S
        toggles story / show all
      </div>
    </div>
  );
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
  const layout = useMemo(() => computeLayout(doc), [doc]);
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

  const { session, dispatch, setViewport } = useBlueprintSession(handleCameraIntent);

  const { showAll, openEventIds, focusAnchorId, workflowFromEventId, workflowToEventId } = {
    showAll: session.board.showAll,
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
          position: layout.positions.get(n.id) ?? { x: 0, y: 0 },
        })),
    [doc.nodes, layout.positions],
  );

  const {
    hoverExpandedId,
    previewPhase,
    onPaneMouseMove,
    onPaneMouseLeave,
    clearHover,
  } = useHoverPreview(doc, layout.positions, eventTargets, hoverPreviewEnabled);

  previewPhaseRef.current = previewPhase;

  const focusState = useMemo(
    () => ({
      ...sessionToFocusState(session, hoverExpandedId),
      workflowPath,
    }),
    [session, hoverExpandedId, workflowPath],
  );
  focusStateRef.current = focusState;

  usePinchZoom(canvasRef, { minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM });

  useEffect(() => {
    if (!session.hydrated || viewportRestored.current) return;
    viewportRestored.current = true;
    if (session.board.workflowFromEventId && session.board.workflowToEventId) {
      return;
    }
    if (session.viewport) {
      restoreViewport(session.viewport);
    }
  }, [
    session.hydrated,
    session.viewport,
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

  const gutterEmphasis = useMemo(
    () => computeGutterEmphasis(doc, focusState, previewPhase),
    [doc, focusState, previewPhase],
  );

  const onFlowMove = useCallback((_: unknown, viewport: Viewport) => {
    setFlowViewport(viewport);
  }, []);

  const resetToEventsOnly = useCallback(() => {
    clearHover();
    dispatch({ type: "RESET_STORY" });
  }, [clearHover, dispatch]);

  const toggleStoryOrShowAll = useCallback(() => {
    clearHover();
    dispatch({ type: "TOGGLE_STORY_OR_SHOW_ALL" });
  }, [clearHover, dispatch]);

  const storyMode = !showAll && openEventIds.size === 0 && !focusAnchorId;
  const holdFocus = focusHold(focusState);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "s" && event.key !== "S") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
      event.preventDefault();
      toggleStoryOrShowAll();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleStoryOrShowAll]);

  const onCanvasDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      const el = event.target as HTMLElement;
      if (el.closest(".react-flow__node")) return;
      if (!el.closest(".react-flow__pane")) return;
      toggleStoryOrShowAll();
    },
    [toggleStoryOrShowAll],
  );

  const handleMoveEnd = useCallback(() => {
    onMoveEnd(setViewport);
  }, [onMoveEnd, setViewport]);

  const index = useMemo(() => indexForCanvas(doc), [doc]);

  const baseStickyNodes: Node[] = useMemo(
    () =>
      doc.nodes.map((n) => {
        const p = layout.positions.get(n.id) ?? { x: 0, y: 0 };
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
    [doc.nodes, layout.positions, focusAnchorId, workflowPath],
  );

  const allEdges = useMemo(
    () => buildEdges(doc, layout.positions),
    [doc, layout.positions],
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
    showAll || openEventIds.size > 0 || hoverExpandedId !== null || focusAnchorId !== null;

  const metaLine = workflowPath.status === "valid"
    ? `Workflow route — ${workflowPath.eventIds.size} events highlighted`
    : showAll
    ? "Full board — all nodes and edges"
    : focusAnchorId
      ? holdFocus
        ? `Focus — ${formatFocusLabel(doc, focusAnchorId)} · story`
        : `Focus — ${formatFocusLabel(doc, focusAnchorId)} · ${openEventIds.size} open slice(s)`
      : openEventIds.size > 0
        ? `${openEventIds.size} open slice(s) · click an event to focus`
        : "Story — streams (one row per EventStore pattern) · hover for preview · click an event for detail";

  return (
    <>
      <header className="app-header">
        <div>
          <h1>{index.meta.name}</h1>
          <div className="meta">{metaLine}</div>
        </div>
        <BoardControls
          showAll={showAll}
          storyMode={storyMode}
          onShowAll={() => {
            clearHover();
            dispatch({ type: "SHOW_ALL_ON" });
          }}
          onEventsOnly={resetToEventsOnly}
        />
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
      <WorkflowRouteBar
        options={workflowEventOptions}
        fromEventId={workflowFromEventId}
        toEventId={workflowToEventId}
        path={workflowPath}
        onSetFrom={(eventId) => dispatch({ type: "WORKFLOW_SET_FROM", eventId })}
        onSetTo={(eventId) => dispatch({ type: "WORKFLOW_SET_TO", eventId })}
        onClear={() => dispatch({ type: "WORKFLOW_CLEAR" })}
      />
      <div className="canvas-wrap" ref={canvasRef} onDoubleClick={onCanvasDoubleClick}>
        <div ref={gutterRef} className="lane-gutter-host">
          <SwimlaneGutter
            rows={layout.swimlaneRows}
            viewport={flowViewport}
            gutterHeight={gutterHeight}
            emphasis={gutterEmphasis}
            showAll={showAll}
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
    </>
  );
}
