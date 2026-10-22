import { useCallback, useRef } from "react";
import { useReactFlow, type Viewport } from "@xyflow/react";
import type { BlueprintDocument } from "@schema/document.js";

import {
  allStickyNodeIds,
  eventTimelineNodeIds,
  focusFitClosure,
} from "./graphIndex.js";
import { computeWorkflowPath } from "./workflowPath.js";
import type { LayoutResult } from "./layout.js";
import type { CameraIntent } from "./sessionState.js";
import type { FocusState, PreviewPhase } from "./viewMode.js";
import { visibleDiagramNodeIds } from "./viewMode.js";

const FOCUS_DEBOUNCE_MS = 80;

function fitPaddingForIntent(intent: CameraIntent): number {
  switch (intent.type) {
    case "FrameStoryTimeline":
      return 0.12;
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
}) {
  const { doc, minZoom, maxZoom, getFocusState, getPreviewPhase } = options;
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
        case "FrameFocusClosure":
          return [...focusFitClosure(doc, intent.anchorId)];
        case "FrameVisibleOpen":
          return visibleDiagramNodeIds(doc, getFocusState(), getPreviewPhase());
        case "FrameFullBoard":
          return allStickyNodeIds(doc);
        case "FrameWorkflowPath": {
          const path = computeWorkflowPath(doc, intent.fromEventId, intent.toEventId);
          if (path.status !== "valid") return eventTimelineNodeIds(doc);
          return [...path.eventIds];
        }
        default:
          return [];
      }
    },
    [doc, getFocusState, getPreviewPhase],
  );

  const runIntent = useCallback(
    (intent: CameraIntent) => {
      if (intent.type === "Preserve") return;

      const ids = nodeIdsForIntent(intent);
      if (ids.length === 0) return;

      const duration = prefersReducedMotion() ? 0 : 280;
      ignoreViewportUntil.current = Date.now() + duration + 120;

      const timelineSpine =
        intent.type === "FrameFullBoard" && getFocusState().diagramMode === "timeline";
      const fitMinZoom = timelineSpine ? Math.min(minZoom, 0.1) : minZoom;

      requestAnimationFrame(() => {
        void fitView({
          nodes: ids.map((id) => ({ id })),
          padding: fitPaddingForIntent(intent),
          duration,
          minZoom: fitMinZoom,
          maxZoom,
        });
      });
    },
    [fitView, getFocusState, maxZoom, minZoom, nodeIdsForIntent],
  );

  const scheduleIntent = useCallback(
    (intent: CameraIntent) => {
      if (intent.type === "FrameFocusClosure") {
        if (focusDebounce.current) clearTimeout(focusDebounce.current);
        focusDebounce.current = setTimeout(() => runIntent(intent), FOCUS_DEBOUNCE_MS);
        return;
      }
      if (focusDebounce.current) {
        clearTimeout(focusDebounce.current);
        focusDebounce.current = null;
      }
      runIntent(intent);
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
    (intent: CameraIntent) => {
      if (intent.type === "Preserve") return;
      scheduleIntent(intent);
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
