import { useCallback, useRef } from "react";
import type { Node } from "@xyflow/react";

import type { StickyData } from "./StickyNode";
import type { DisplayTier, PreviewPhase } from "./viewMode";

const PIN_CLICK_DELAY_MS = 280;

const FOCUS_TOGGLE_KINDS = new Set(["command", "view", "screen"]);

export function useStickyClickDispatch(options: {
  previewPhase: PreviewPhase;
  onEventClick: (eventId: string) => void;
  onFocusAnchorToggle: (nodeId: string) => void;
}) {
  const { previewPhase, onEventClick, onFocusAnchorToggle } = options;
  const pinClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canClickNode = useCallback((data: StickyData) => {
    const tier = data.displayTier ?? "full";
    if (tier === "hidden") return false;
    if (tier === "preview" && previewPhase !== "active") return false;
    return true;
  }, [previewPhase]);

  const dispatchForNode = useCallback(
    (node: Node) => {
      if (node.type !== "sticky") return;
      const data = node.data as StickyData;
      if (!canClickNode(data)) return;

      if (data.kind === "event") {
        onEventClick(node.id);
        return;
      }
      if (FOCUS_TOGGLE_KINDS.has(data.kind)) {
        onFocusAnchorToggle(node.id);
      }
    },
    [canClickNode, onEventClick, onFocusAnchorToggle],
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (pinClickTimer.current) clearTimeout(pinClickTimer.current);
      pinClickTimer.current = setTimeout(() => {
        pinClickTimer.current = null;
        dispatchForNode(node);
      }, PIN_CLICK_DELAY_MS);
    },
    [dispatchForNode],
  );

  const onNodeDoubleClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      if (node.type !== "sticky") return;
      event.stopPropagation();
      if (pinClickTimer.current) {
        clearTimeout(pinClickTimer.current);
        pinClickTimer.current = null;
      }
      dispatchForNode(node);
    },
    [dispatchForNode],
  );

  return { onNodeClick, onNodeDoubleClick };
}
