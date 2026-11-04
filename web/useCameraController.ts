import { useCallback, useRef } from "react";
import { useReactFlow, type Viewport } from "@xyflow/react";
import type { BlueprintDocument } from "@schema/document.js";

import {
  allStickyNodeIds,
  eventTimelineNodeIds,
  focusFitClosure,
} from "./graphIndex.js";
import { computeTimelineRange, computeWorkflowPath } from "./workflowPath.js";
import type { LayoutResult } from "./layout.js";
import type { CameraIntent } from "./sessionState.js";
import type { FocusState, PreviewPhase } from "./viewMode.js";
import { visibleDiagramNodeIds } from "./viewMode.js";
import { DESIGN_BOARD_PADDING, designBoardViewport, designScreenNodeIds } from "./designStoryCamera.js";
import { STREAM_STORY_PADDING, streamStoryViewport } from "./streamStoryCamera.js";

const FOCUS_DEBOUNCE_MS = 80;
const DEFAULT_FIT_MS = 280;

export type CameraRunOptions = {
  duration?: number;
  /** When false, focus intents run immediately (e.g. layout morph sync). */
  debounce?: boolean;
};

function fitPaddingForIntent(intent: CameraIntent): number {
  switch (intent.type) {
    case "FrameStoryTimeline":
      return 0.12;
    case "FrameDesignBoard":
      return DESIGN_BOARD_PADDING;
    case "FrameFocusClosure":
      return 0.22;
    case "FrameVisibleOpen":
      return 0.18;
    case "FrameFullBoard":
      return 0.18;
    case "FrameWorkflowPath":
      return 0.14;
    default:
      return 0.22;
  }
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function toViewportState(vp: Viewport) {
  return { x: vp.x, y: vp.y, zoom: vp.zoom };
}

export function useCameraController(options: {
  doc: BlueprintDocument;
  layout: LayoutResult;
  minZoom: number;
  maxZoom: number;
  getFocusState: () => FocusState;
  getPreviewPhase: () => PreviewPhase;
  getFlowPaneSize: () => { width: number; height: number };
}) {
  const { doc, layout, minZoom, maxZoom, getFocusState, getPreviewPhase, getFlowPaneSize } =
    options;
  const { fitView, setViewport, getViewport } = useReactFlow();
  const ignoreViewportUntil = useRef(0);
  const focusDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const nodeIdsForIntent = useCallback(
    (intent: CameraIntent): string[] => {
      switch (intent.type) {
        case "Preserve":
          return [];
        case "FrameStoryTimeline":
          return eventTimelineNodeIds(doc);
        case "FrameDesignBoard":
          return designScreenNodeIds(doc);
        case "FrameFocusClosure":
          return [...focusFitClosure(doc, intent.anchorId)];
        case "FrameVisibleOpen":
          return visibleDiagramNodeIds(doc, getFocusState(), getPreviewPhase());
        case "FrameFullBoard":
          return allStickyNodeIds(doc);
        case "FrameWorkflowPath": {
          const mode = getFocusState().diagramMode;
          const path =
            mode === "timeline"
              ? computeTimelineRange(doc, intent.fromEventId, intent.toEventId)
              : computeWorkflowPath(doc, intent.fromEventId, intent.toEventId);
          if (path.status !== "valid") return eventTimelineNodeIds(doc);
          return mode === "timeline" ? [...path.neighborIds] : [...path.eventIds];
        }
        default:
          return [];
      }
    },
    [doc, getFocusState, getPreviewPhase],
  );

  const runIntent = useCallback(
    (intent: CameraIntent, options: CameraRunOptions = {}) => {
      if (intent.type === "Preserve") return;

      const ids = nodeIdsForIntent(intent);
      if (ids.length === 0) return;

      const duration =
        prefersReducedMotion() ? 0 : (options.duration ?? DEFAULT_FIT_MS);
      ignoreViewportUntil.current = Date.now() + duration + 120;

      const padding = fitPaddingForIntent(intent);
      const mode = getFocusState().diagramMode;
      const streamStory = intent.type === "FrameStoryTimeline" && mode === "stream";
      const designBoard = intent.type === "FrameDesignBoard" && mode === "design";

      requestAnimationFrame(() => {
        if (streamStory) {
          const { width, height } = getFlowPaneSize();
          const vp = streamStoryViewport(
            layout,
            doc,
            width,
            height,
            STREAM_STORY_PADDING,
            minZoom,
            maxZoom,
          );
          setViewport(vp, { duration });
          return;
        }

        if (designBoard) {
          const { width, height } = getFlowPaneSize();
          const vp = designBoardViewport(
            layout,
            doc,
            width,
            height,
            DESIGN_BOARD_PADDING,
            minZoom,
            maxZoom,
          );
          setViewport(vp, { duration });
          return;
        }

        const timelineFullBoard = intent.type === "FrameFullBoard" && mode === "timeline";
        const fitMinZoom = timelineFullBoard ? Math.min(minZoom, 0.1) : minZoom;

        void fitView({
          nodes: ids.map((id) => ({ id })),
          padding,
          duration,
          minZoom: fitMinZoom,
          maxZoom,
        });
      });
    },
    [
      doc,
      fitView,
      getFlowPaneSize,
      getFocusState,
      layout,
      maxZoom,
      minZoom,
      nodeIdsForIntent,
      setViewport,
    ],
  );

  const scheduleIntent = useCallback(
    (intent: CameraIntent, options: CameraRunOptions = {}) => {
      const debounce = options.debounce !== false;
      if (intent.type === "FrameFocusClosure" && debounce) {
        if (focusDebounce.current) clearTimeout(focusDebounce.current);
        focusDebounce.current = setTimeout(() => runIntent(intent, options), FOCUS_DEBOUNCE_MS);
        return;
      }
      if (focusDebounce.current) {
        clearTimeout(focusDebounce.current);
        focusDebounce.current = null;
      }
      runIntent(intent, options);
    },
    [runIntent],
  );

  const restoreViewport = useCallback(
    (viewport: { x: number; y: number; zoom: number }) => {
      ignoreViewportUntil.current = Date.now() + 150;
      setViewport(viewport, { duration: 0 });
    },
    [setViewport],
  );

  const handleCameraIntent = useCallback(
    (intent: CameraIntent, options?: CameraRunOptions) => {
      if (intent.type === "Preserve") return;
      scheduleIntent(intent, options);
    },
    [scheduleIntent],
  );

  const onMoveEnd = useCallback(
    (onPersist: (vp: { x: number; y: number; zoom: number }) => void) => {
      if (Date.now() < ignoreViewportUntil.current) return;
      onPersist(toViewportState(getViewport()));
    },
    [getViewport],
  );

  return {
    handleCameraIntent,
    restoreViewport,
    onMoveEnd,
    scheduleIntent,
  };
}
