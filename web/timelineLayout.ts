import type { BlueprintDocument } from "@schema/document.js";
import type { BlueprintNode } from "@schema/nodes.js";
import { storyIndexByEventId, storyIndexForEvent } from "../src/narrativeOrder.js";
import {
  BAND_GAP,
  GAP_AFTER_COMMAND,
  INTER_COL_GAP,
  LANE_ROW_HEIGHT,
  MARGIN_X,
  MIN_COL_WIDTH,
  NODE_W,
  SCREEN_STAGGER_X,
  SLICE_PAD,
  SWIMLANE_GUTTER,
  yForLaneRow,
  type LayoutResult,
  type NodePosition,
  type SwimlaneRow,
} from "./layoutMetrics.js";

const TIMELINE_EVENTS_ROW_ID = "__timeline_events__";
export const TIMELINE_SCREENS_ROW_ID = "__timeline_screens__";

const BAND_ORDER = ["ui", "commandView", "events"] as const;

function buildTimelineSwimlaneRows(doc: BlueprintDocument): SwimlaneRow[] {
  const rows: SwimlaneRow[] = [];
  let y = 48;

  for (const band of BAND_ORDER) {
    if (band === "events") {
      rows.push({
        id: TIMELINE_EVENTS_ROW_ID,
        name: "Events",
        band: "events",
        order: 0,
        y,
        yLine: y + LANE_ROW_HEIGHT,
        height: LANE_ROW_HEIGHT,
      });
      y += LANE_ROW_HEIGHT + BAND_GAP;
      continue;
    }

    if (band === "ui") {
      rows.push({
        id: TIMELINE_SCREENS_ROW_ID,
        name: "Screens",
        band: "ui",
        order: 0,
        y,
        yLine: y + LANE_ROW_HEIGHT,
        height: LANE_ROW_HEIGHT,
      });
      y += LANE_ROW_HEIGHT + BAND_GAP;
      continue;
    }

    if (band === "commandView") {
      const lanes = doc.swimlanes.filter((s) => s.band === band).sort((a, b) => a.order - b.order);
      const lane = lanes[0];
      if (lane) {
        rows.push({
          id: lane.id,
          name: "Commands · Views",
          band: lane.band,
          order: lane.order,
          y,
          yLine: y + LANE_ROW_HEIGHT,
          height: LANE_ROW_HEIGHT,
        });
        y += LANE_ROW_HEIGHT + BAND_GAP;
      }
      continue;
    }
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
  return candidates.sort(
    (a, b) => storyIndexForEvent(doc, b.id) - storyIndexForEvent(doc, a.id),
  )[0];
}

function columnContentWidthAtStoryIndex(
  doc: BlueprintDocument,
  storyIndex: number,
  events: Array<BlueprintNode & { type: "event" }>,
  viewsByAnchor: Map<string, BlueprintNode[]>,
  maxScreensAtSi: Map<number, number>,
): number {
  let need = NODE_W;

  for (const event of events) {
    if (storyIndexForEvent(doc, event.id) !== storyIndex) continue;
    const fan = viewsByAnchor.get(event.id) ?? [];
    if (fan.length) {
      const span = NODE_W + GAP_AFTER_COMMAND + fan.length * (NODE_W + GAP_AFTER_COMMAND);
      need = Math.max(need, span);
    }
  }

  const stack = maxScreensAtSi.get(storyIndex) ?? 0;
  if (stack > 1) {
    need = Math.max(need, NODE_W + (stack - 1) * SCREEN_STAGGER_X);
  }

  for (const n of doc.nodes) {
    if (n.type !== "command") continue;
    const producesEvt = n.produces
      .map((id) => events.find((e) => e.id === id))
      .find((e) => e && storyIndexForEvent(doc, e.id) === storyIndex);
    if (producesEvt) need = Math.max(need, NODE_W);
  }

  return Math.max(MIN_COL_WIDTH, need + SLICE_PAD);
}

function buildStoryX(
  doc: BlueprintDocument,
  events: Array<BlueprintNode & { type: "event" }>,
  viewsByAnchor: Map<string, BlueprintNode[]>,
  maxScreensAtSi: Map<number, number>,
  storyIndices: number[],
): (storyIndex: number) => number {
  const xAt = new Map<number, number>();
  let x = SWIMLANE_GUTTER + MARGIN_X;
  for (const si of storyIndices) {
    xAt.set(si, x);
    x += columnContentWidthAtStoryIndex(doc, si, events, viewsByAnchor, maxScreensAtSi) + INTER_COL_GAP;
  }
  const fallback = xAt.get(storyIndices[0] ?? 0) ?? SWIMLANE_GUTTER + MARGIN_X;
  return (storyIndex: number) => xAt.get(storyIndex) ?? fallback;
}

function screenStoryIndex(
  doc: BlueprintDocument,
  n: BlueprintNode & { type: "screen" },
  events: Array<BlueprintNode & { type: "event" }>,
): number {
  const issue = doc.edges.find((e) => e.rel === "issues" && e.from === n.id);
  if (issue) {
    const cmd = doc.nodes.find((x) => x.id === issue.to && x.type === "command");
    const evtId = cmd?.type === "command" ? cmd.produces[0] : undefined;
    const evt = evtId ? events.find((e) => e.id === evtId) : undefined;
    return evt ? storyIndexForEvent(doc, evt.id) : 0;
  }
  const render = doc.edges.find((e) => e.rel === "rendersOn" && e.to === n.id);
  if (render) {
    const view = doc.nodes.find((x) => x.id === render.from && x.type === "view");
    if (view?.type === "view") {
      const anchor = anchorEventForView(doc, view, events);
      return anchor ? storyIndexForEvent(doc, anchor.id) : 0;
    }
  }
  const inSlice = doc.nodes.filter((x) => x.sliceId === n.sliceId);
  const evt = inSlice.find((x) => x.type === "event");
  return evt?.type === "event" ? storyIndexForEvent(doc, evt.id) : 0;
}

function maxScreensPerStoryIndex(
  doc: BlueprintDocument,
  events: Array<BlueprintNode & { type: "event" }>,
): Map<number, number> {
  const countAtSi = new Map<number, number>();
  for (const n of doc.nodes) {
    if (n.type !== "screen") continue;
    const si = screenStoryIndex(doc, n, events);
    countAtSi.set(si, (countAtSi.get(si) ?? 0) + 1);
  }
  const maxAtSi = countAtSi;
  return maxAtSi;
}

export function computeTimelineLayout(doc: BlueprintDocument): LayoutResult {
  const swimlaneRows = buildTimelineSwimlaneRows(doc);
  const yBySwimlane = new Map(swimlaneRows.map((r) => [r.id, r.y]));
  const yUi = swimlaneRows.find((r) => r.band === "ui")?.y ?? 48;
  const yMid = swimlaneRows.find((r) => r.band === "commandView")?.y ?? 220;
  const yEvt = swimlaneRows.find((r) => r.band === "events")?.y ?? 400;
  const yMidPlaced = yForLaneRow(yMid);
  const yEventPlaced = yForLaneRow(yEvt);

  const positions = new Map<string, NodePosition>();
  const events = doc.nodes.filter(
    (n): n is BlueprintNode & { type: "event" } => n.type === "event",
  );

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

  const indexMap = storyIndexByEventId(doc);
  const storyIndices = [...new Set<number>(indexMap.values())].sort((a, b) => a - b);
  const maxScreensAtSi = maxScreensPerStoryIndex(doc, events);
  const xAtStory = buildStoryX(doc, events, viewsByAnchor, maxScreensAtSi, storyIndices);

  const screenSlot = new Map<string, number>();

  const screensRowY = yBySwimlane.get(TIMELINE_SCREENS_ROW_ID) ?? yUi;

  function placeScreen(id: string, baseX: number, storyIndex: number) {
    const key = `${storyIndex}|${Math.round(baseX)}`;
    const idx = screenSlot.get(key) ?? 0;
    screenSlot.set(key, idx + 1);
    positions.set(id, { x: baseX + idx * SCREEN_STAGGER_X, y: yForLaneRow(screensRowY) });
  }

  for (const event of events) {
    const si = storyIndexForEvent(doc, event.id);
    const anchorX = xAtStory(si);
    const cmd = producingCommand(doc, event.id);

    if (cmd) {
      positions.set(cmd.id, { x: anchorX, y: yMidPlaced });
    }
    positions.set(event.id, { x: anchorX, y: yEventPlaced });

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
    positions.set(view.id, { x: xAtStory(0) + NODE_W + GAP_AFTER_COMMAND, y: yMidPlaced });
  }

  for (const n of doc.nodes) {
    if (n.layout) {
      positions.set(n.id, n.layout);
      continue;
    }
    if (n.type === "screen") {
      const issue = doc.edges.find((e) => e.rel === "issues" && e.from === n.id);
      if (issue) {
        const cmdPos = positions.get(issue.to);
        const cmd = doc.nodes.find((x) => x.id === issue.to && x.type === "command");
        const evtId = cmd?.type === "command" ? cmd.produces[0] : undefined;
        const si = evtId ? storyIndexForEvent(doc, evtId) : 0;
        placeScreen(n.id, cmdPos?.x ?? xAtStory(0), si);
        continue;
      }
      const render = doc.edges.find((e) => e.rel === "rendersOn" && e.to === n.id);
      if (render) {
        const viewPos = positions.get(render.from);
        const si = screenStoryIndex(doc, n, events);
        placeScreen(n.id, viewPos?.x ?? xAtStory(0), si);
        continue;
      }
      const si = screenStoryIndex(doc, n, events);
      placeScreen(n.id, xAtStory(si), si);
    }
  }

  return { positions, swimlaneRows };
}

export { TIMELINE_EVENTS_ROW_ID };
