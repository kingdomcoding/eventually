import type { BlueprintDocument } from "@schema/document.js";
import type { Viewport } from "@xyflow/react";
import { eventTimelineNodeIds } from "./graphIndex.js";
import type { LayoutResult } from "./layout.js";

/** Keep stream labels legible; pan vertically for long multi-stream boards. */
export const SWIMLANE_STORY_MIN_ZOOM = 0.58;

/**
 * Swimlane "story" framing: fill the viewport with the EventStore stream band
 * (vertical) and anchor on the left spine (horizontal). Does not zoom out to
 * fit the widest stream — pan right for long chains.
 */
export function swimlaneStoryViewport(
  layout: LayoutResult,
  doc: BlueprintDocument,
  paneWidth: number,
  paneHeight: number,
  paddingFraction: number,
  minZoom: number,
  maxZoom: number,
): Viewport {
  const pad = paddingFraction;
  const innerW = paneWidth * (1 - pad * 2);
  const innerH = paneHeight * (1 - pad * 2);

  const eventRows = layout.swimlaneRows.filter((r) => r.band === "events");
  const bandTop = eventRows[0]?.y ?? 0;
  const bandBottom = eventRows[eventRows.length - 1]?.yLine ?? bandTop + innerH;

  let minX = Infinity;
  for (const id of eventTimelineNodeIds(doc)) {
    const p = layout.positions.get(id);
    if (p) minX = Math.min(minX, p.x);
  }
  if (!Number.isFinite(minX)) minX = 0;

  const bandH = Math.max(1, bandBottom - bandTop);
  const zoomFromHeight = innerH / bandH;
  const zoom = Math.min(
    maxZoom,
    Math.max(minZoom, SWIMLANE_STORY_MIN_ZOOM, zoomFromHeight),
  );

  const screenPadX = paneWidth * pad;
  const screenPadY = paneHeight * pad;

  return {
    x: screenPadX - minX * zoom,
    y: screenPadY - bandTop * zoom,
    zoom,
  };
}

/** Rough check that saved viewport matches swimlane story scale (not timeline full-board). */
export function swimlaneViewportLooksStale(
  zoom: number,
  layout: LayoutResult,
  doc: BlueprintDocument,
  paneHeight: number,
  minZoom: number,
  maxZoom: number,
): boolean {
  const target = swimlaneStoryViewport(
    layout,
    doc,
    800,
    paneHeight,
    0.12,
    minZoom,
    maxZoom,
  );
  return zoom < target.zoom * 0.72;
}
