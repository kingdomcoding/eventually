import { useCallback, useRef, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import type { BlueprintDocument } from "@schema/document.js";
import type { PreviewPhase } from "./viewMode";
import {
  findEventUnderPointer,
  pointerInHoverCluster,
  type FlowPoint,
} from "./eventHitTest";

const ENTER_DELAY_MS = 100;
const LEAVE_DELAY_MS = 140;
const FADE_MS = 220;

type EventTarget = { id: string; position: FlowPoint };

export function useHoverPreview(
  doc: BlueprintDocument,
  positions: Map<string, FlowPoint>,
  eventTargets: EventTarget[],
  hoverEnabled = true,
) {
  const { screenToFlowPosition, getZoom } = useReactFlow();

  const enterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingEventId = useRef<string | null>(null);

  const [hoverExpandedId, setHoverExpandedId] = useState<string | null>(null);
  const [previewPhase, setPreviewPhase] = useState<PreviewPhase>("idle");
  const hoverExpandedRef = useRef<string | null>(null);
  hoverExpandedRef.current = hoverExpandedId;

  const cancelLeave = useCallback(() => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    leaveTimer.current = null;
  }, []);

  const cancelEnter = useCallback(() => {
    if (enterTimer.current) clearTimeout(enterTimer.current);
    enterTimer.current = null;
    pendingEventId.current = null;
  }, []);

  const clearHover = useCallback(() => {
    cancelEnter();
    cancelLeave();
    if (exitTimer.current) clearTimeout(exitTimer.current);
    exitTimer.current = null;
    setHoverExpandedId(null);
    setPreviewPhase("idle");
  }, [cancelEnter, cancelLeave]);

  const beginExit = useCallback(() => {
    if (!hoverExpandedRef.current) return;
    cancelEnter();
    cancelLeave();
    setPreviewPhase("leaving");
    if (exitTimer.current) clearTimeout(exitTimer.current);
    exitTimer.current = setTimeout(() => {
      setHoverExpandedId(null);
      setPreviewPhase("idle");
      exitTimer.current = null;
    }, FADE_MS);
  }, [cancelEnter, cancelLeave]);

  const scheduleLeave = useCallback(() => {
    if (leaveTimer.current) return;
    leaveTimer.current = setTimeout(() => {
      leaveTimer.current = null;
      if (hoverExpandedRef.current) beginExit();
      else cancelEnter();
    }, LEAVE_DELAY_MS);
  }, [beginExit, cancelEnter]);

  const scheduleEnter = useCallback(
    (eventId: string) => {
      if (hoverExpandedRef.current === eventId) return;
      if (pendingEventId.current === eventId && enterTimer.current) return;

      cancelEnter();
      cancelLeave();
      if (exitTimer.current) {
        clearTimeout(exitTimer.current);
        exitTimer.current = null;
      }

      pendingEventId.current = eventId;
      enterTimer.current = setTimeout(() => {
        enterTimer.current = null;
        pendingEventId.current = null;
        setHoverExpandedId(eventId);
        setPreviewPhase("idle");
        requestAnimationFrame(() => {
          requestAnimationFrame(() => setPreviewPhase("active"));
        });
      }, ENTER_DELAY_MS);
    },
    [cancelEnter, cancelLeave],
  );

  const onPaneMouseMove = useCallback(
    (event: React.MouseEvent) => {
      if (!hoverEnabled) {
        scheduleLeave();
        return;
      }
      const zoom = getZoom();
      const flow = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const eventId = findEventUnderPointer(flow, eventTargets, zoom);
      const expanded = hoverExpandedRef.current;

      if (eventId) {
        cancelLeave();
        if (exitTimer.current) {
          clearTimeout(exitTimer.current);
          exitTimer.current = null;
          setPreviewPhase("active");
        }
        if (expanded === eventId) {
          setPreviewPhase((p) => (p === "leaving" ? "active" : p === "idle" ? "active" : p));
          return;
        }
        scheduleEnter(eventId);
        return;
      }

      if (expanded && pointerInHoverCluster(doc, expanded, flow, positions, zoom)) {
        cancelLeave();
        if (exitTimer.current) {
          clearTimeout(exitTimer.current);
          exitTimer.current = null;
        }
        setPreviewPhase((p) => (p === "leaving" || p === "idle" ? "active" : p));
        return;
      }

      scheduleLeave();
    },
    [
      cancelLeave,
      doc,
      eventTargets,
      getZoom,
      positions,
      scheduleEnter,
      scheduleLeave,
      screenToFlowPosition,
      hoverEnabled,
    ],
  );

  const onPaneMouseLeave = useCallback(() => {
    scheduleLeave();
  }, [scheduleLeave]);

  return {
    hoverExpandedId,
    previewPhase,
    onPaneMouseMove,
    onPaneMouseLeave,
    clearHover,
  };
}
