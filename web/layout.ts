import type { BlueprintDocument } from "@schema/document.js";
import type { BlueprintNode } from "@schema/nodes.js";
import type { StreamShape } from "@schema/streamShape.js";
import {
  BAND_GAP,
  COL_WIDTH,
  GAP_AFTER_COMMAND,
  INTER_COL_GAP,
  LANE_ROW_HEIGHT,
  MARGIN_X,
  MIN_COL_WIDTH,
  NODE_H,
  NODE_W,
  SCREEN_STAGGER_X,
  SLICE_PAD,
  STREAM_GUTTER,
  yForLaneRow,
  type LayoutResult,
  type NodePosition,
  type StreamRow,
} from "./layoutMetrics.js";
import { layoutAllStreams } from "./streamLayout.js";
import { computeDesignLayout } from "./designLayout.js";
import { computeTimelineLayout } from "./timelineLayout.js";

import type { DiagramMode } from "./sessionTypes.js";
export type { DiagramMode };

export {
  BAND_GAP,
  COL_WIDTH,
  GAP_AFTER_COMMAND,
  INTER_COL_GAP,
  LANE_ROW_HEIGHT,
  MARGIN_X,
  MIN_COL_WIDTH,
  NODE_H,
  NODE_W,
  SCREEN_STAGGER_X,
  SLICE_PAD,
  STREAM_GUTTER,
  yForLaneRow,
  type LayoutResult,
  type NodePosition,
  type StreamRow,
};

const STREAM_STACK_GAP = 96;
const STREAM_ROW_PAD = 28;

function laneHeightForStreamShape(shape?: StreamShape): number {
  if (!shape?.layoutColumns?.length) return LANE_ROW_HEIGHT;
  const depth = Math.max(...shape.layoutColumns.map((c) => c.length), 1);
  if (depth <= 1) return LANE_ROW_HEIGHT;
  return (depth - 1) * STREAM_STACK_GAP + NODE_H + STREAM_ROW_PAD * 2;
}

const BAND_ORDER = ["ui", "commandView", "events"] as const;

function columnContentWidth(
  doc: BlueprintDocument,
  timelineIndex: number,
  events: Array<BlueprintNode & { type: "event" }>,
  viewsByAnchor: Map<string, BlueprintNode[]>,
  maxScreensAtTi: Map<number, number>,
): number {
  let need = NODE_W;

  for (const event of events.filter((e) => e.timelineIndex === timelineIndex)) {
    const fan = viewsByAnchor.get(event.id) ?? [];
    if (fan.length) {
      const span = NODE_W + GAP_AFTER_COMMAND + fan.length * (NODE_W + GAP_AFTER_COMMAND);
      need = Math.max(need, span);
    }
  }

  const stack = maxScreensAtTi.get(timelineIndex) ?? 0;
  if (stack > 1) {
    need = Math.max(need, NODE_W + (stack - 1) * SCREEN_STAGGER_X);
  }

  for (const n of doc.nodes) {
    if (n.type !== "command") continue;
    const producesEvt = n.produces
      .map((id) => events.find((e) => e.id === id))
      .find((e) => e && e.timelineIndex === timelineIndex);
    if (producesEvt) need = Math.max(need, NODE_W);
  }

  return Math.max(MIN_COL_WIDTH, need + SLICE_PAD);
}

function buildTimelineX(
  doc: BlueprintDocument,
  events: Array<BlueprintNode & { type: "event" }>,
  viewsByAnchor: Map<string, BlueprintNode[]>,
  maxScreensAtTi: Map<number, number>,
  streamShape?: StreamShape,
): (timelineIndex: number) => number {
  const indices =
    streamShape?.layoutColumns?.length ?
      streamShape.layoutColumns.map((_, i) => i)
    : [...new Set(events.map((e) => e.timelineIndex))].sort((a, b) => a - b);
  const xAt = new Map<number, number>();
  let x = STREAM_GUTTER + MARGIN_X;
  for (const ti of indices) {
    xAt.set(ti, x);
    x += columnContentWidth(doc, ti, events, viewsByAnchor, maxScreensAtTi) + INTER_COL_GAP;
  }
  const fallback = xAt.get(indices[0] ?? 0) ?? STREAM_GUTTER + MARGIN_X;
  return (timelineIndex: number) => xAt.get(timelineIndex) ?? fallback;
}

function screenTimelineIndex(
  doc: BlueprintDocument,
  n: BlueprintNode,
  events: Array<BlueprintNode & { type: "event" }>,
): number {
  const issue = doc.edges.find((e) => e.rel === "issues" && e.from === n.id);
  if (issue) {
    const cmd = doc.nodes.find((x) => x.id === issue.to && x.type === "command");
    const evtId = cmd?.type === "command" ? cmd.produces[0] : undefined;
    const evt = evtId ? events.find((e) => e.id === evtId) : undefined;
    return evt?.timelineIndex ?? 0;
  }
  const render = doc.edges.find((e) => e.rel === "rendersOn" && e.to === n.id);
  if (render) {
    const view = doc.nodes.find((x) => x.id === render.from && x.type === "dataTable");
    if (view?.type === "dataTable") {
      const anchor = anchorEventForDataTable(doc, view, events);
      return anchor?.timelineIndex ?? 0;
    }
  }
  const inSlice = doc.nodes.filter((x) => x.sliceId === n.sliceId);
  const evt = inSlice.find((x) => x.type === "event");
  return evt?.type === "event" ? evt.timelineIndex : 0;
}

function maxScreensPerTimeline(
  doc: BlueprintDocument,
  events: Array<BlueprintNode & { type: "event" }>,
): Map<number, number> {
  const perLaneTi = new Map<string, number>();
  for (const n of doc.nodes) {
    if (n.type !== "screen" && n.type !== "automation" && n.type !== "trigger") continue;
    const ti = screenTimelineIndex(doc, n, events);
    const k = `${n.streamId}|${ti}`;
    perLaneTi.set(k, (perLaneTi.get(k) ?? 0) + 1);
  }
  const maxAtTi = new Map<number, number>();
  for (const [k, c] of perLaneTi) {
    const ti = Number(k.split("|")[1]);
    maxAtTi.set(ti, Math.max(maxAtTi.get(ti) ?? 0, c));
  }
  return maxAtTi;
}

function buildStreamRows(doc: BlueprintDocument): StreamRow[] {
  const rows: StreamRow[] = [];
  let y = 48;

  for (const band of BAND_ORDER) {
    const lanes = doc.streams.filter((s) => s.band === band).sort((a, b) => a.order - b.order);
    if (!lanes.length) continue;

    for (const lane of lanes) {
      const height =
        lane.band === "events" ? laneHeightForStreamShape(lane.streamShape) : LANE_ROW_HEIGHT;
      rows.push({
        id: lane.id,
        name: lane.name,
        band: lane.band,
        order: lane.order,
        y,
        yLine: y + height,
        height,
        streamPattern: lane.streamPattern,
      });
      y += height;
    }
    y += BAND_GAP;
  }

  return rows;
}

function producingCommand(doc: BlueprintDocument, eventId: string) {
  return doc.nodes.find((n) => n.type === "command" && n.produces.includes(eventId));
}

function anchorEventForDataTable(
  doc: BlueprintDocument,
  view: BlueprintNode & { type: "dataTable" },
  events: Array<BlueprintNode & { type: "event" }>,
): (BlueprintNode & { type: "event" }) | undefined {
  const candidates = view.fedBy
    .map((id) => events.find((e) => e.id === id))
    .filter(Boolean) as Array<BlueprintNode & { type: "event" }>;
  if (!candidates.length) return undefined;
  return candidates.sort((a, b) => b.timelineIndex - a.timelineIndex)[0];
}

function computeStreamLayout(doc: BlueprintDocument): LayoutResult {
  const streamRows = buildStreamRows(doc);
  const yByStream = new Map(streamRows.map((r) => [r.id, r.y]));
  const yUi = streamRows.find((r) => r.band === "ui")?.y ?? 48;
  const yMid = streamRows.find((r) => r.band === "commandView")?.y ?? 220;
  const yEvtFallback = streamRows.find((r) => r.band === "events")?.y ?? 400;

  function rowY(streamId: string, band: "ui" | "events"): number {
    const y = yByStream.get(streamId);
    if (y !== undefined) return y;
    return band === "ui" ? yUi : yEvtFallback;
  }

  const laneHeightById = new Map(streamRows.map((r) => [r.id, r.height]));

  function eventRowY(streamId: string): number {
    const y = yByStream.get(streamId) ?? yEvtFallback;
    const h = laneHeightById.get(streamId) ?? LANE_ROW_HEIGHT;
    return yForLaneRow(y, h);
  }

  const yMidPlaced = yForLaneRow(yMid);

  const positions = new Map<string, NodePosition>();

  const events = doc.nodes
    .filter((n): n is BlueprintNode & { type: "event" } => n.type === "event")
    .sort((a, b) => a.timelineIndex - b.timelineIndex);

  const views = doc.nodes.filter(
    (n): n is BlueprintNode & { type: "dataTable" } => n.type === "dataTable",
  );

  const viewsByAnchor = new Map<string, BlueprintNode[]>();
  for (const view of views) {
    const anchor = anchorEventForDataTable(doc, view, events);
    const key = anchor?.id ?? "orphan";
    if (!viewsByAnchor.has(key)) viewsByAnchor.set(key, []);
    viewsByAnchor.get(key)!.push(view);
  }

  const eventsByStream = new Map<string, Array<BlueprintNode & { type: "event" }>>();
  const { positions: streamEventPos } = layoutAllStreams(doc, streamRows);

  for (const event of events) {
    const list = eventsByStream.get(event.streamId) ?? [];
    list.push(event);
    eventsByStream.set(event.streamId, list);
  }

  const sliceXByStream = new Map<string, (timelineIndex: number) => number>();
  for (const [streamId, streamEvents] of eventsByStream) {
    const maxScreensAtTi = maxScreensPerTimeline(doc, streamEvents);
    const laneShape = doc.streams.find((s) => s.id === streamId)?.streamShape;
    sliceXByStream.set(
      streamId,
      buildTimelineX(doc, streamEvents, viewsByAnchor, maxScreensAtTi, laneShape),
    );
  }

  const defaultSliceX: (timelineIndex: number) => number =
    sliceXByStream.values().next().value ??
    ((timelineIndex: number) => STREAM_GUTTER + MARGIN_X + timelineIndex * (MIN_COL_WIDTH + INTER_COL_GAP));

  function xOnStream(streamId: string, timelineIndex: number): number {
    return (sliceXByStream.get(streamId) ?? defaultSliceX)(timelineIndex);
  }

  function timelineXForSlice(sliceId: string): number {
    const inSlice = doc.nodes.filter((n) => n.sliceId === sliceId);
    const evt = inSlice.find((n) => n.type === "event");
    if (evt && evt.type === "event") return xOnStream(evt.streamId, evt.timelineIndex);
    const linked = doc.edges
      .filter((e) => e.rel === "issues" && inSlice.some((n) => n.id === e.from))
      .map((e) => positions.get(e.to))
      .find(Boolean);
    if (linked) return linked.x;
    return defaultSliceX(0);
  }

  const screenSlot = new Map<string, number>();

  function placeScreen(id: string, baseX: number, streamId: string, laneRowY: number) {
    const key = `${streamId}|${baseX}`;
    const idx = screenSlot.get(key) ?? 0;
    screenSlot.set(key, idx + 1);
    positions.set(id, { x: baseX + idx * SCREEN_STAGGER_X, y: yForLaneRow(laneRowY) });
  }

  for (const event of events) {
    const cmd = producingCommand(doc, event.id);
    const streamPos = streamEventPos.get(event.id);
    const sliceX = sliceXByStream.get(event.streamId) ?? defaultSliceX;
    const anchorX = streamPos?.x ?? sliceX(event.timelineIndex);
    const anchorY = streamPos?.y ?? eventRowY(event.streamId);

    if (cmd) {
      positions.set(cmd.id, { x: anchorX, y: yMidPlaced });
    }
    positions.set(event.id, { x: anchorX, y: anchorY });

    const fan = viewsByAnchor.get(event.id) ?? [];
    const viewStartX = anchorX + NODE_W + GAP_AFTER_COMMAND;

    fan.forEach((view, i) => {
      positions.set(view.id, {
        x: viewStartX + i * (NODE_W + GAP_AFTER_COMMAND),
        y: yMidPlaced,
      });
    });
  }

  for (const view of viewsByAnchor.get("orphan") ?? []) {
    positions.set(view.id, { x: defaultSliceX(0) + NODE_W + GAP_AFTER_COMMAND, y: yMidPlaced });
  }

  for (const n of doc.nodes) {
    if (n.layout) {
      positions.set(n.id, n.layout);
      continue;
    }
    if (n.type === "screen" || n.type === "automation" || n.type === "trigger") {
      const laneTop = rowY(n.streamId, "ui");
      const issue = doc.edges.find((e) => e.rel === "issues" && e.from === n.id);
      if (issue) {
        const cmdPos = positions.get(issue.to);
        placeScreen(n.id, cmdPos?.x ?? defaultSliceX(0), n.streamId, laneTop);
        continue;
      }
      const render = doc.edges.find((e) => e.rel === "rendersOn" && e.to === n.id);
      if (render) {
        const viewPos = positions.get(render.from);
        placeScreen(n.id, viewPos?.x ?? defaultSliceX(0), n.streamId, laneTop);
        continue;
      }
      placeScreen(n.id, timelineXForSlice(n.sliceId), n.streamId, laneTop);
    }
  }

  return { positions, streamRows };
}

export function computeLayout(
  doc: BlueprintDocument,
  mode: DiagramMode = "design",
): LayoutResult {
  if (mode === "design") return computeDesignLayout(doc);
  if (mode === "timeline") return computeTimelineLayout(doc);
  return computeStreamLayout(doc);
}

export function computePositions(doc: BlueprintDocument, mode: DiagramMode = "stream"): Map<string, NodePosition> {
  return computeLayout(doc, mode).positions;
}

const DIAGRAM_EXTENT_PAD = 80;

/** Clamp panning to content bounds (avoids huge empty canvas). */
export function diagramTranslateExtent(layout: LayoutResult): [[number, number], [number, number]] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const p of layout.positions.values()) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + NODE_W);
    maxY = Math.max(maxY, p.y + NODE_H);
  }

  if (!Number.isFinite(minX)) {
    return [
      [0, 0],
      [800, 600],
    ];
  }

  const pad = DIAGRAM_EXTENT_PAD;
  return [
    [minX - pad, minY - pad],
    [maxX + pad, maxY + pad],
  ];
}
