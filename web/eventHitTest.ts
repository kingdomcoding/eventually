import type { BlueprintDocument } from "@schema/document.js";
import { connectedNodeIds } from "./viewMode";
import { NODE_H, NODE_W } from "./layout";

/** Extra hit padding in screen pixels (converted to flow space via zoom). */
export const SCREEN_HIT_PAD_PX = 10;
/** Minimum interactive size on screen when zoomed out. */
export const MIN_SCREEN_HIT_PX = 28;

export type FlowPoint = { x: number; y: number };
export type FlowRect = { x: number; y: number; width: number; height: number };

export function paddedEventRect(position: FlowPoint, zoom: number): FlowRect {
  const minW = MIN_SCREEN_HIT_PX / zoom;
  const minH = MIN_SCREEN_HIT_PX / zoom;
  const w = Math.max(NODE_W, minW);
  const h = Math.max(NODE_H, minH);
  const pad = SCREEN_HIT_PAD_PX / zoom;
  const cx = position.x + NODE_W / 2;
  const cy = position.y + NODE_H / 2;
  return {
    x: cx - w / 2 - pad,
    y: cy - h / 2 - pad,
    width: w + pad * 2,
    height: h + pad * 2,
  };
}

export function pointInRect(p: FlowPoint, rect: FlowRect): boolean {
  return (
    p.x >= rect.x &&
    p.x <= rect.x + rect.width &&
    p.y >= rect.y &&
    p.y <= rect.y + rect.height
  );
}

export function findEventUnderPointer(
  flow: FlowPoint,
  events: Array<{ id: string; position: FlowPoint }>,
  zoom: number,
): string | null {
  let best: { id: string; area: number } | null = null;

  for (const event of events) {
    const rect = paddedEventRect(event.position, zoom);
    if (!pointInRect(flow, rect)) continue;
    const area = rect.width * rect.height;
    if (!best || area < best.area) best = { id: event.id, area };
  }

  return best?.id ?? null;
}

export function clusterHitRect(
  doc: BlueprintDocument,
  eventId: string,
  positions: Map<string, FlowPoint>,
  zoom: number,
): FlowRect | null {
  const ids = connectedNodeIds(doc, eventId);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const id of ids) {
    const p = positions.get(id);
    if (!p) continue;
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + NODE_W);
    maxY = Math.max(maxY, p.y + NODE_H);
  }

  if (!Number.isFinite(minX)) return null;

  const pad = SCREEN_HIT_PAD_PX / zoom;
  return {
    x: minX - pad,
    y: minY - pad,
    width: maxX - minX + pad * 2,
    height: maxY - minY + pad * 2,
  };
}

export function pointerInHoverCluster(
  doc: BlueprintDocument,
  eventId: string,
  flow: FlowPoint,
  positions: Map<string, FlowPoint>,
  zoom: number,
): boolean {
  const rect = clusterHitRect(doc, eventId, positions, zoom);
  if (!rect) return false;
  return pointInRect(flow, rect);
}
