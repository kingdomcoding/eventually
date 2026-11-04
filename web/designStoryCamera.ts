import type { BlueprintDocument } from "@schema/document.js";
import type { Viewport } from "@xyflow/react";
import { NODE_H, NODE_W, type LayoutResult } from "./layoutMetrics.js";

export const DESIGN_BOARD_MIN_ZOOM = 0.45;
export const DESIGN_BOARD_PADDING = 0.12;

export function designScreenNodeIds(doc: BlueprintDocument): string[] {
  return doc.nodes
    .filter((n) => n.type === "screen" || n.type === "automation" || n.type === "trigger")
    .map((n) => n.id);
}

/** Fit all user-category rows and screen stickies in the pane. */
export function designBoardViewport(
  layout: LayoutResult,
  doc: BlueprintDocument,
  paneWidth: number,
  paneHeight: number,
  paddingFraction: number,
  minZoom: number,
  maxZoom: number,
): Viewport {
  const ids = designScreenNodeIds(doc);
  const pad = paddingFraction;
  const innerW = paneWidth * (1 - pad * 2);
  const innerH = paneHeight * (1 - pad * 2);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const id of ids) {
    const p = layout.positions.get(id);
    if (!p) continue;
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + NODE_W);
    maxY = Math.max(maxY, p.y + NODE_H);
  }

  const uiRows = layout.streamRows.filter((r) => r.band === "ui");
  if (uiRows.length) {
    minY = Math.min(minY, uiRows[0]!.y);
    maxY = Math.max(maxY, uiRows[uiRows.length - 1]!.yLine);
  }

  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = uiRows[0]?.y ?? 48;
    maxX = minX + 400;
    maxY = minY + (uiRows.length || 1) * 80;
  }

  const contentW = Math.max(1, maxX - minX);
  const contentH = Math.max(1, maxY - minY);
  const zoom = Math.min(
    maxZoom,
    Math.max(minZoom, DESIGN_BOARD_MIN_ZOOM, innerW / contentW, innerH / contentH),
  );

  const screenPadX = paneWidth * pad;
  const screenPadY = paneHeight * pad;

  return {
    x: screenPadX - minX * zoom,
    y: screenPadY - minY * zoom,
    zoom,
  };
}
