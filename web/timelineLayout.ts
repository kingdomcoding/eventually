import type { BlueprintDocument } from "@schema/document.js";
import type { BlueprintNode } from "@schema/nodes.js";
import { storyIndexForEvent } from "../src/narrativeOrder.js";
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
  STREAM_GUTTER,
  yForLaneRow,
  type LayoutResult,
  type NodePosition,
  type StreamRow,
} from "./layoutMetrics.js";

const TIMELINE_EVENTS_ROW_ID = "__timeline_events__";
export const TIMELINE_TRIGGERS_ROW_ID = "__timeline_triggers__";

const BAND_ORDER = ["ui", "commandView", "events"] as const;

function buildTimelineStreamRows(doc: BlueprintDocument): StreamRow[] {
  const rows: StreamRow[] = [];
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
        id: TIMELINE_TRIGGERS_ROW_ID,
        name: "Triggers",
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
      const lanes = doc.streams.filter((s) => s.band === band).sort((a, b) => a.order - b.order);
      const lane = lanes[0];
      if (lane) {
        rows.push({
          id: lane.id,
          name: "Commands · Data Tables",
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

function commandIssuedFromScreen(
  doc: BlueprintDocument,
  screen: BlueprintNode & { type: "screen" },
): string | undefined {
  for (const n of doc.nodes) {
    if (n.type !== "trigger" || !n.parents?.includes(screen.name)) continue;
    const issue = doc.edges.find((e) => e.rel === "issues" && e.from === n.id);
    if (issue) return issue.to;
  }
  return doc.edges.find((e) => e.rel === "issues" && e.from === screen.id)?.to;
}

/** Tables that feed a trigger issuing this command — sit immediately before it (e.g. Open Cohort Windows → Available License Cards). */
function catalogViewsBeforeCommand(
  doc: BlueprintDocument,
  commandId: string,
): Array<BlueprintNode & { type: "dataTable" }> {
  const out: Array<BlueprintNode & { type: "dataTable" }> = [];
  for (const view of doc.nodes) {
    if (view.type !== "dataTable") continue;
    const feedsTrigger = doc.edges.some((e) => {
      if (e.rel !== "rendersOn" || e.from !== view.id) return false;
      const target = doc.nodes.find((n) => n.id === e.to);
      if (target?.type !== "trigger") return false;
      return doc.edges.some(
        (issue) => issue.rel === "issues" && issue.from === target.id && issue.to === commandId,
      );
    });
    if (feedsTrigger) out.push(view);
  }
  return out;
}

function viewsPrecedingAnyCommand(doc: BlueprintDocument): Set<string> {
  const ids = new Set<string>();
  for (const n of doc.nodes) {
    if (n.type !== "command") continue;
    for (const view of catalogViewsBeforeCommand(doc, n.id)) ids.add(view.id);
  }
  return ids;
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
  return candidates.sort(
    (a, b) => storyIndexForEvent(doc, b.id) - storyIndexForEvent(doc, a.id),
  )[0];
}

function storyIndexForCatalogView(
  doc: BlueprintDocument,
  view: BlueprintNode & { type: "dataTable" },
  events: Array<BlueprintNode & { type: "event" }>,
): number | undefined {
  for (const edge of doc.edges) {
    if (edge.rel !== "rendersOn" || edge.from !== view.id) continue;
    const target = doc.nodes.find((n) => n.id === edge.to);
    let cmdId: string | undefined;
    if (target?.type === "trigger") {
      cmdId = doc.edges.find((e) => e.rel === "issues" && e.from === target.id)?.to;
    } else if (target?.type === "screen") {
      cmdId = commandIssuedFromScreen(doc, target);
    }
    const cmd = cmdId ? doc.nodes.find((n) => n.id === cmdId && n.type === "command") : undefined;
    const evtId = cmd?.type === "command" ? cmd.produces[0] : undefined;
    const evt = evtId ? events.find((e) => e.id === evtId) : undefined;
    if (evt) return storyIndexForEvent(doc, evt.id);
  }
  return undefined;
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
    const cmd = producingCommand(doc, event.id);
    const pre = cmd ? catalogViewsBeforeCommand(doc, cmd.id) : [];
    const fan = viewsByAnchor.get(event.id) ?? [];
    const span =
      pre.length * (NODE_W + GAP_AFTER_COMMAND) +
      NODE_W +
      (fan.length ? GAP_AFTER_COMMAND + fan.length * (NODE_W + GAP_AFTER_COMMAND) : 0);
    need = Math.max(need, span);
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
  let x = STREAM_GUTTER + MARGIN_X;
  for (const si of storyIndices) {
    xAt.set(si, x);
    x += columnContentWidthAtStoryIndex(doc, si, events, viewsByAnchor, maxScreensAtSi) + INTER_COL_GAP;
  }
  const fallback = xAt.get(storyIndices[0] ?? 0) ?? STREAM_GUTTER + MARGIN_X;
  return (storyIndex: number) => xAt.get(storyIndex) ?? fallback;
}

function screenStoryIndex(
  doc: BlueprintDocument,
  n: BlueprintNode,
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
    const view = doc.nodes.find((x) => x.id === render.from && x.type === "dataTable");
    if (view?.type === "dataTable") {
      const anchor = anchorEventForDataTable(doc, view, events);
      if (anchor) return storyIndexForEvent(doc, anchor.id);
      const catalogSi = storyIndexForCatalogView(doc, view, events);
      if (catalogSi !== undefined) return catalogSi;
    }
  }
  const inSlice = doc.nodes.filter((x) => x.sliceId === n.sliceId);
  const evt = inSlice.find((x) => x.type === "event");
  if (evt?.type === "event") return storyIndexForEvent(doc, evt.id);

  // Modality-only slices (e.g. Paystack checkout) may have views/screens but no events.
  // Anchor UI to the view's fedBy event, or to a sibling screen that renders a view.
  for (const sibling of inSlice) {
    if (sibling.type === "dataTable") {
      const anchor = anchorEventForDataTable(doc, sibling, events);
      if (anchor) return storyIndexForEvent(doc, anchor.id);
    }
  }
  for (const sibling of inSlice) {
    if (sibling.type !== "screen") continue;
    const siblingRender = doc.edges.find((e) => e.rel === "rendersOn" && e.to === sibling.id);
    if (!siblingRender) continue;
    const view = doc.nodes.find((x) => x.id === siblingRender.from && x.type === "dataTable");
    if (view?.type === "dataTable") {
      const anchor = anchorEventForDataTable(doc, view, events);
      if (anchor) return storyIndexForEvent(doc, anchor.id);
    }
  }
  return 0;
}

function maxScreensPerStoryIndex(
  doc: BlueprintDocument,
  events: Array<BlueprintNode & { type: "event" }>,
): Map<number, number> {
  const countAtSi = new Map<number, number>();
  for (const n of doc.nodes) {
    if (n.type !== "screen" && n.type !== "automation" && n.type !== "trigger") continue;
    const si = screenStoryIndex(doc, n, events);
    countAtSi.set(si, (countAtSi.get(si) ?? 0) + 1);
  }
  return countAtSi;
}

export function computeTimelineLayout(doc: BlueprintDocument): LayoutResult {
  const streamRows = buildTimelineStreamRows(doc);
  const yByStream = new Map(streamRows.map((r) => [r.id, r.y]));
  const yUi = streamRows.find((r) => r.band === "ui")?.y ?? 48;
  const yMid = streamRows.find((r) => r.band === "commandView")?.y ?? 220;
  const yEvt = streamRows.find((r) => r.band === "events")?.y ?? 400;
  const yMidPlaced = yForLaneRow(yMid);
  const yEventPlaced = yForLaneRow(yEvt);

  const positions = new Map<string, NodePosition>();
  const events = doc.nodes.filter(
    (n): n is BlueprintNode & { type: "event" } => n.type === "event",
  );

  const views = doc.nodes.filter(
    (n): n is BlueprintNode & { type: "dataTable" } => n.type === "dataTable",
  );

  const precedingViewIds = viewsPrecedingAnyCommand(doc);
  const viewsByAnchor = new Map<string, BlueprintNode[]>();
  for (const view of views) {
    // UI-fed tables sit before their command; don't also fan them after a fedBy event.
    if (precedingViewIds.has(view.id)) continue;
    const anchor = anchorEventForDataTable(doc, view, events);
    const key = anchor?.id ?? "orphan";
    if (!viewsByAnchor.has(key)) viewsByAnchor.set(key, []);
    viewsByAnchor.get(key)!.push(view);
  }

  const storyIndices = [...new Set(events.map((e) => storyIndexForEvent(doc, e.id)))].sort(
    (a, b) => a - b,
  );
  const maxScreensAtSi = maxScreensPerStoryIndex(doc, events);
  const xAtStory = buildStoryX(doc, events, viewsByAnchor, maxScreensAtSi, storyIndices);

  const screenSlot = new Map<string, number>();

  const screensRowY = yByStream.get(TIMELINE_TRIGGERS_ROW_ID) ?? yUi;

  function placeScreen(id: string, baseX: number, storyIndex: number) {
    const key = `${storyIndex}|${Math.round(baseX)}`;
    const idx = screenSlot.get(key) ?? 0;
    screenSlot.set(key, idx + 1);
    positions.set(id, { x: baseX + idx * SCREEN_STAGGER_X, y: yForLaneRow(screensRowY) });
  }

  const placedCatalogIds = new Set<string>();

  for (const event of events) {
    const si = storyIndexForEvent(doc, event.id);
    const anchorX = xAtStory(si);
    const cmd = producingCommand(doc, event.id);
    const pre = cmd ? catalogViewsBeforeCommand(doc, cmd.id) : [];

    pre.forEach((view, i) => {
      positions.set(view.id, {
        x: anchorX + i * (NODE_W + GAP_AFTER_COMMAND),
        y: yMidPlaced,
      });
      placedCatalogIds.add(view.id);
    });

    const cmdX = anchorX + pre.length * (NODE_W + GAP_AFTER_COMMAND);
    if (cmd) {
      positions.set(cmd.id, { x: cmdX, y: yMidPlaced });
    }
    positions.set(event.id, { x: cmdX, y: yEventPlaced });

    const fan = viewsByAnchor.get(event.id) ?? [];
    const viewStartX = cmdX + NODE_W + GAP_AFTER_COMMAND;
    fan.forEach((view, i) => {
      positions.set(view.id, {
        x: viewStartX + i * (NODE_W + GAP_AFTER_COMMAND),
        y: yMidPlaced,
      });
    });
  }

  for (const view of viewsByAnchor.get("orphan") ?? []) {
    if (placedCatalogIds.has(view.id)) continue;
    const catalogSi = storyIndexForCatalogView(doc, view, events);
    if (catalogSi !== undefined) {
      positions.set(view.id, {
        x: xAtStory(catalogSi),
        y: yMidPlaced,
      });
      continue;
    }
    positions.set(view.id, { x: xAtStory(0) + NODE_W + GAP_AFTER_COMMAND, y: yMidPlaced });
  }

  /** Screens that only receive redirects (no issues) — place after redirect sources. */
  const redirectLandingUi: BlueprintNode[] = [];

  for (const n of doc.nodes) {
    if (n.layout) {
      positions.set(n.id, n.layout);
      continue;
    }
    if (n.type === "screen" || n.type === "automation" || n.type === "trigger") {
      const issue = doc.edges.find((e) => e.rel === "issues" && e.from === n.id);
      if (issue) {
        const cmdPos = positions.get(issue.to);
        const cmd = doc.nodes.find((x) => x.id === issue.to && x.type === "command");
        const evtId =
          cmd?.type === "command"
            ? cmd.produces[0]
            : undefined;
        const si = evtId ? storyIndexForEvent(doc, evtId) : 0;
        placeScreen(n.id, cmdPos?.x ?? xAtStory(si), si);
        continue;
      }
      const render = doc.edges.find((e) => e.rel === "rendersOn" && e.to === n.id);
      if (render) {
        const viewPos = positions.get(render.from);
        const si = screenStoryIndex(doc, n, events);
        placeScreen(n.id, viewPos?.x ?? xAtStory(0), si);
        continue;
      }
      const isRedirectLanding = doc.edges.some((e) => e.rel === "redirectsTo" && e.to === n.id);
      if (isRedirectLanding) {
        redirectLandingUi.push(n);
        continue;
      }
      // Orphan UI in a modality slice: sit with the slice's view (payment page column).
      const viewInSlice = doc.nodes.find(
        (x) => x.sliceId === n.sliceId && x.type === "dataTable",
      );
      const si = screenStoryIndex(doc, n, events);
      if (viewInSlice) {
        const viewPos = positions.get(viewInSlice.id);
        placeScreen(n.id, viewPos?.x ?? xAtStory(si), si);
        continue;
      }
      placeScreen(n.id, xAtStory(si), si);
    }
  }

  for (const n of redirectLandingUi) {
    const sources = doc.edges.filter((e) => e.rel === "redirectsTo" && e.to === n.id);
    let maxSourceX = 0;
    for (const edge of sources) {
      const sourcePos = positions.get(edge.from);
      if (sourcePos) maxSourceX = Math.max(maxSourceX, sourcePos.x);
    }
    const si = screenStoryIndex(doc, n, events);
    placeScreen(n.id, maxSourceX + SCREEN_STAGGER_X, si);
  }

  return { positions, streamRows };
}

export { TIMELINE_EVENTS_ROW_ID };
