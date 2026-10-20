import type { BlueprintDocument } from "@schema/document.js";
import type { StreamShape } from "@schema/streamShape.js";
import type { BlueprintNode } from "@schema/nodes.js";
import {
  NODE_W,
  NODE_H,
  SWIMLANE_GUTTER,
  MARGIN_X,
  yForLaneRow,
  type SwimlaneRow,
} from "./layout.js";

const COL_GAP = 300;
/** Match `STREAM_STACK_GAP` in layout.ts (vertical OR stacks). */
const STACK_GAP = 96;

export type StreamLayoutResult = {
  positions: Map<string, { x: number; y: number }>;
};

function laneEvents(
  doc: BlueprintDocument,
  swimlaneId: string,
): Array<BlueprintNode & { type: "event" }> {
  return doc.nodes.filter(
    (n): n is BlueprintNode & { type: "event" } =>
      n.type === "event" && n.swimlaneId === swimlaneId,
  );
}

function stackY(rowY: number, laneHeight: number, index: number, count: number): number {
  if (count <= 1) return yForLaneRow(rowY, laneHeight);
  const totalH = (count - 1) * STACK_GAP + NODE_H;
  const start = rowY + (laneHeight - totalH) / 2;
  return start + index * STACK_GAP;
}

function layoutFromColumns(
  rowY: number,
  laneHeight: number,
  columns: string[][],
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const spineY = yForLaneRow(rowY, laneHeight);

  let xCursor = SWIMLANE_GUTTER + MARGIN_X;

  columns.forEach((colIds, colIndex) => {
    const isLast = colIndex === columns.length - 1;

    if (colIds.length === 1) {
      positions.set(colIds[0]!, { x: xCursor, y: spineY });
      xCursor += NODE_W + (isLast ? 0 : COL_GAP);
      return;
    }

    colIds.forEach((id, i) => {
      positions.set(id, { x: xCursor, y: stackY(rowY, laneHeight, i, colIds.length) });
    });
    xCursor += NODE_W + (isLast ? 0 : COL_GAP);
  });

  return positions;
}

function layoutLinearSpine(
  rowY: number,
  laneHeight: number,
  events: Array<BlueprintNode & { type: "event" }>,
  out: Map<string, { x: number; y: number }>,
) {
  const sorted = [...events].sort((a, b) => a.timelineIndex - b.timelineIndex);
  let x = SWIMLANE_GUTTER + MARGIN_X;
  const baseY = yForLaneRow(rowY, laneHeight);
  for (const e of sorted) {
    out.set(e.id, { x, y: baseY });
    x += COL_GAP;
  }
}

function layoutStreamRow(
  row: SwimlaneRow,
  shape: StreamShape | undefined,
  events: Array<BlueprintNode & { type: "event" }>,
): Map<string, { x: number; y: number }> {
  if (shape?.layoutColumns?.length) {
    return layoutFromColumns(row.y, row.height, shape.layoutColumns);
  }

  const positions = new Map<string, { x: number; y: number }>();
  layoutLinearSpine(row.y, row.height, events, positions);
  return positions;
}

export function layoutAllStreams(
  doc: BlueprintDocument,
  swimlaneRows: SwimlaneRow[],
): StreamLayoutResult {
  const positions = new Map<string, { x: number; y: number }>();
  const rowById = new Map(swimlaneRows.map((r) => [r.id, r]));

  for (const lane of doc.swimlanes.filter((s) => s.band === "events")) {
    const row = rowById.get(lane.id);
    if (!row) continue;
    const events = laneEvents(doc, lane.id);
    const rowPos = layoutStreamRow(row, lane.streamShape, events);
    for (const [id, p] of rowPos) positions.set(id, p);
  }

  return { positions };
}
