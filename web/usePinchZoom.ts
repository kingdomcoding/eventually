import { useEffect, type RefObject } from "react";
import { useReactFlow } from "@xyflow/react";

/** Matches @xyflow/system macOS ctrl+wheel boost (Linux trackpads omit it by default). */
const PINCH_GAIN = 10;

function pinchDeltaFromWheel(event: WheelEvent): number {
  const scale = event.deltaMode === 1 ? 0.05 : event.deltaMode ? 1 : 0.002;
  return -event.deltaY * scale * PINCH_GAIN;
}

export function usePinchZoom(
  containerRef: RefObject<HTMLElement | null>,
  options: { minZoom: number; maxZoom: number },
) {
  const { getViewport, setViewport } = useReactFlow();
  const { minZoom, maxZoom } = options;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      const rect = el.getBoundingClientRect();
      const pointerX = event.clientX - rect.left;
      const pointerY = event.clientY - rect.top;

      const { x, y, zoom } = getViewport();
      const delta = pinchDeltaFromWheel(event);
      const nextZoom = Math.min(maxZoom, Math.max(minZoom, zoom * 2 ** delta));
      if (nextZoom === zoom) return;

      const flowX = (pointerX - x) / zoom;
      const flowY = (pointerY - y) / zoom;
      setViewport({
        x: pointerX - flowX * nextZoom,
        y: pointerY - flowY * nextZoom,
        zoom: nextZoom,
      });
    };

    el.addEventListener("wheel", onWheel, { capture: true, passive: false });
    return () => el.removeEventListener("wheel", onWheel, { capture: true });
  }, [containerRef, getViewport, setViewport, minZoom, maxZoom]);
}
