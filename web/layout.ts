import type { BlueprintDocument } from "@schema/document.js";
import type { BlueprintNode } from "@schema/nodes.js";
import type { StreamShape } from "@schema/streamShape.js";
import { layoutAllStreams } from "./streamLayout.js";

const STREAM_STACK_GAP = 96;
const STREAM_ROW_PAD = 28;

function laneHeightForStreamShape(shape?: StreamShape): number {
  if (!shape?.layoutColumns?.length) return LANE_ROW_HEIGHT;
  const depth = Math.max(...shape.layoutColumns.map((c) => c.length), 1);
  if (depth <= 1) return LANE_ROW_HEIGHT;
  return (depth - 1) * STREAM_STACK_GAP + NODE_H + STREAM_ROW_PAD * 2;
}

/** Left gutter: swimlane labels only — not part of any time slice. */
export const SWIMLANE_GUTTER = 200;

export const COL_WIDTH = 340;
export const MARGIN_X = 48;
export const LANE_ROW_HEIGHT = 128;
export const BAND_GAP = 52;

/** Top Y for a sticky centered in its swimlane row (React Flow node origin). */
export function yForLaneRow(rowY: number, laneHeight: number = LANE_ROW_HEIGHT): number {
  return rowY + (laneHeight - NODE_H) / 2;
}
export const SLICE_PAD = 16;

export const NODE_W = 168;
export const NODE_H = 76;

const GAP_AFTER_COMMAND = 28;
/** Space between timeline columns (after each column’s content width). */
const INTER_COL_GAP = 32;
const MIN_COL_WIDTH = NODE_W + 40;
/** Horizontal stagger when two screens share a swimlane and column anchor. */
const SCREEN_STAGGER_X = NODE_W + 24;

export type NodePosition = { x: number; y: number };

export type SwimlaneRow = {
  id: string;
  name: string;
  band: "ui" | "commandView" | "events" | "integration";
  order: number;
  y: number;
  yLine: number;
  /** Row height in flow space (events streams may grow for vertical OR stacks). */
  height: number;
  streamPattern?: string;
};

export type LayoutResult = {
  positions: Map<string, NodePosition>;
  swimlaneRows: SwimlaneRow[];
};

const BAND_ORDER = ["ui", "commandView", "events", "integration"] as const;

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
  let x = SWIMLANE_GUTTER + MARGIN_X;
  for (const ti of indices) {
    xAt.set(ti, x);
    x += columnContentWidth(doc, ti, events, viewsByAnchor, maxScreensAtTi) + INTER_COL_GAP;
  }
  const fallback = xAt.get(indices[0] ?? 0) ?? SWIMLANE_GUTTER + MARGIN_X;
  return (timelineIndex: number) => xAt.get(timelineIndex) ?? fallback;
}

function screenTimelineIndex(
  doc: BlueprintDocument,
  n: BlueprintNode & { type: "screen" },
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
    const view = doc.nodes.find((x) => x.id === render.from && x.type === "view");
    if (view?.type === "view") {
      const anchor = anchorEventForView(doc, view, events);
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
    if (n.type !== "screen") continue;
    const ti = screenTimelineIndex(doc, n, events);
    const k = `${n.swimlaneId}|${ti}`;
    perLaneTi.set(k, (perLaneTi.get(k) ?? 0) + 1);
  }
  const maxAtTi = new Map<number, number>();
  for (const [k, c] of perLaneTi) {
    const ti = Number(k.split("|")[1]);
    maxAtTi.set(ti, Math.max(maxAtTi.get(ti) ?? 0, c));
  }
  return maxAtTi;
}

function buildSwimlaneRows(doc: BlueprintDocument): SwimlaneRow[] {
  const rows: SwimlaneRow[] = [];
  let y = 48;

  for (const band of BAND_ORDER) {
    const lanes = doc.swimlanes.filter((s) => s.band === band).sort((a, b) => a.order - b.order);
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

function anchorEventForView(
  doc: BlueprintDocument,
  view: BlueprintNode & { type: "view" },
  events: Array<BlueprintNode & { type: "event" }>,
): (BlueprintNode & { type: "event" }) | undefined {
  const candidates = view.fedBy
    .map((id) => events.find((e) => e.id === id))
    .filter(Boolean) as Array<BlueprintNode & { type: "event" }>;
  if (!candidates.length) return undefined;
  return candidates.sort((a, b) => b.timelineIndex - a.timelineIndex)[0];
}

export function computeLayout(doc: BlueprintDocument): LayoutResult {
  const swimlaneRows = buildSwimlaneRows(doc);
  const yBySwimlane = new Map(swimlaneRows.map((r) => [r.id, r.y]));
  const yUi = swimlaneRows.find((r) => r.band === "ui")?.y ?? 48;
  const yMid = swimlaneRows.find((r) => r.band === "commandView")?.y ?? 220;
  const yEvtFallback = swimlaneRows.find((r) => r.band === "events")?.y ?? 400;

  function rowY(swimlaneId: string, band: "ui" | "events"): number {
    const y = yBySwimlane.get(swimlaneId);
    if (y !== undefined) return y;
    return band === "ui" ? yUi : yEvtFallback;
  }

  const laneHeightById = new Map(swimlaneRows.map((r) => [r.id, r.height]));

  function eventRowY(swimlaneId: string): number {
    const y = yBySwimlane.get(swimlaneId) ?? yEvtFallback;
    const h = laneHeightById.get(swimlaneId) ?? LANE_ROW_HEIGHT;
    return yForLaneRow(y, h);
  }

  const yMidPlaced = yForLaneRow(yMid);

  const positions = new Map<string, NodePosition>();

  const events = doc.nodes
    .filter((n): n is BlueprintNode & { type: "event" } => n.type === "event")
    .sort((a, b) => a.timelineIndex - b.timelineIndex);

  const views = doc.nodes.filter(
    (n): n is BlueprintNode & { type: "view" } => n.type === "view",
  );

  const viewsByAnchor = new Map<string, BlueprintNode[]>();
  for (const view of views) {
    const anchor = anchorEventForView(doc, view, events);
    const key = anchor?.id ?? "orphan";
    if (!viewsByAnchor.has(key)) viewsByAnchor.set(key, []);
    viewsByAnchor.get(key)!.push(view);
  }

  const eventsByStream = new Map<string, Array<BlueprintNode & { type: "event" }>>();
  const { positions: streamEventPos } = layoutAllStreams(doc, swimlaneRows);

  for (const event of events) {
    const list = eventsByStream.get(event.swimlaneId) ?? [];
    list.push(event);
    eventsByStream.set(event.swimlaneId, list);
  }

  const sliceXByStream = new Map<string, (timelineIndex: number) => number>();
  for (const [streamId, streamEvents] of eventsByStream) {
    const maxScreensAtTi = maxScreensPerTimeline(doc, streamEvents);
    const laneShape = doc.swimlanes.find((s) => s.id === streamId)?.streamShape;
    sliceXByStream.set(
      streamId,
      buildTimelineX(doc, streamEvents, viewsByAnchor, maxScreensAtTi, laneShape),
    );
  }

  const defaultSliceX: (timelineIndex: number) => number =
    sliceXByStream.values().next().value ??
    ((timelineIndex: number) => SWIMLANE_GUTTER + MARGIN_X + timelineIndex * (MIN_COL_WIDTH + INTER_COL_GAP));

  function xOnStream(swimlaneId: string, timelineIndex: number): number {
    return (sliceXByStream.get(swimlaneId) ?? defaultSliceX)(timelineIndex);
  }

  function timelineXForSlice(sliceId: string): number {
    const inSlice = doc.nodes.filter((n) => n.sliceId === sliceId);
    const evt = inSlice.find((n) => n.type === "event");
    if (evt && evt.type === "event") return xOnStream(evt.swimlaneId, evt.timelineIndex);
    const linked = doc.edges
      .filter((e) => e.rel === "issues" && inSlice.some((n) => n.id === e.from))
      .map((e) => positions.get(e.to))
      .find(Boolean);
    if (linked) return linked.x;
    return defaultSliceX(0);
  }

  const screenSlot = new Map<string, number>();

  function placeScreen(id: string, baseX: number, swimlaneId: string, laneRowY: number) {
    const key = `${swimlaneId}|${baseX}`;
    const idx = screenSlot.get(key) ?? 0;
    screenSlot.set(key, idx + 1);
    positions.set(id, { x: baseX + idx * SCREEN_STAGGER_X, y: yForLaneRow(laneRowY) });
  }

  for (const event of events) {
    const cmd = producingCommand(doc, event.id);
    const streamPos = streamEventPos.get(event.id);
    const sliceX = sliceXByStream.get(event.swimlaneId) ?? defaultSliceX;
    const anchorX = streamPos?.x ?? sliceX(event.timelineIndex);
    const anchorY = streamPos?.y ?? eventRowY(event.swimlaneId);

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
    if (n.type === "screen") {
      const laneTop = rowY(n.swimlaneId, "ui");
      const issue = doc.edges.find((e) => e.rel === "issues" && e.from === n.id);
      if (issue) {
        const cmdPos = positions.get(issue.to);
        placeScreen(n.id, cmdPos?.x ?? defaultSliceX(0), n.swimlaneId, laneTop);
        continue;
      }
      const render = doc.edges.find((e) => e.rel === "rendersOn" && e.to === n.id);
      if (render) {
        const viewPos = positions.get(render.from);
        placeScreen(n.id, viewPos?.x ?? defaultSliceX(0), n.swimlaneId, laneTop);
        continue;
      }
      placeScreen(n.id, timelineXForSlice(n.sliceId), n.swimlaneId, laneTop);
    }
    if (n.type === "integration") {
      positions.set(n.id, { x: defaultSliceX(0), y: yMidPlaced });
    }
  }

  return { positions, swimlaneRows };
}

export function computePositions(doc: BlueprintDocument): Map<string, NodePosition> {
  return computeLayout(doc).positions;
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
