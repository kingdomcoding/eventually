import type { BlueprintDocument } from "@schema/document.js";
import { narrativeSpanOf, orderedNarrativeEventIds } from "../src/narrativeOrder.js";
import { eventDetailCluster } from "./graphIndex.js";

export type WorkflowPathErrorCode =
  | "missing_endpoint"
  | "not_events"
  | "unknown_event"
  | "not_connected";

export type WorkflowPathResult =
  | { status: "inactive" }
  | {
      status: "invalid";
      code: WorkflowPathErrorCode;
      message: string;
    }
  | {
      status: "valid";
      fromEventId: string;
      toEventId: string;
      eventIds: ReadonlySet<string>;
      edgeIds: ReadonlySet<string>;
      neighborIds: ReadonlySet<string>;
    };

function addAdj(adj: Map<string, string[]>, from: string, to: string) {
  if (from === to) return;
  const list = adj.get(from) ?? [];
  if (!list.includes(to)) list.push(to);
  adj.set(from, list);
}

/** Partial-order reachability on one stream (then, loop-back, unordered pool). */
function streamAdjacency(doc: BlueprintDocument, streamId: string): Map<string, string[]> {
  const adj = new Map<string, string[]>();

  for (const e of doc.edges) {
    if (e.rel !== "ordersBefore" && e.rel !== "loopsBack") continue;
    const from = doc.nodes.find((n) => n.id === e.from);
    const to = doc.nodes.find((n) => n.id === e.to);
    if (from?.streamId !== streamId || to?.streamId !== streamId) continue;
    addAdj(adj, e.from, e.to);
  }

  const shape = doc.streams.find((s) => s.id === streamId)?.streamShape;
  const pool = shape?.unorderedPool;
  if (pool) {
    for (const id of pool.eventIds) addAdj(adj, pool.afterEventId, id);
    for (const a of pool.eventIds) {
      for (const b of pool.eventIds) {
        if (a !== b) addAdj(adj, a, b);
      }
    }
  }

  return adj;
}

function forwardReach(fromId: string, adj: Map<string, string[]>): Set<string> {
  const seen = new Set<string>();
  const stack = [fromId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const next of adj.get(id) ?? []) {
      if (!seen.has(next)) stack.push(next);
    }
  }
  return seen;
}

function backwardReach(toId: string, adj: Map<string, string[]>): Set<string> {
  const rev = new Map<string, string[]>();
  for (const [from, tos] of adj) {
    for (const to of tos) {
      const list = rev.get(to) ?? [];
      list.push(from);
      rev.set(to, list);
    }
  }
  return forwardReach(toId, rev);
}

function neighborIdsForPath(doc: BlueprintDocument, eventIds: ReadonlySet<string>): Set<string> {
  const out = new Set<string>();
  for (const eventId of eventIds) {
    for (const id of eventDetailCluster(doc, eventId)) out.add(id);
  }
  return out;
}

/** Inclusive narrative-order slice for Timeline. From must be at or before To. */
export function computeTimelineRange(
  doc: BlueprintDocument,
  fromEventId: string | null,
  toEventId: string | null,
): WorkflowPathResult {
  if (!fromEventId && !toEventId) return { status: "inactive" };
  if (!fromEventId || !toEventId) {
    return {
      status: "invalid",
      code: "missing_endpoint",
      message: "Set both start and end events to dim the rest of the timeline.",
    };
  }

  const fromNode = doc.nodes.find((n) => n.id === fromEventId);
  const toNode = doc.nodes.find((n) => n.id === toEventId);
  if (!fromNode || !toNode) {
    return {
      status: "invalid",
      code: "unknown_event",
      message: "Start or end event was not found on this blueprint.",
    };
  }
  if (fromNode.type !== "event" || toNode.type !== "event") {
    return {
      status: "invalid",
      code: "not_events",
      message: "Timeline endpoints must be events.",
    };
  }

  const order = orderedNarrativeEventIds(doc);
  const iFrom = order.indexOf(fromEventId);
  const iTo = order.indexOf(toEventId);
  if (iFrom < 0 || iTo < 0) {
    return {
      status: "invalid",
      code: "unknown_event",
      message: "Start or end event is not on the timeline.",
    };
  }
  if (iFrom > iTo) {
    return {
      status: "invalid",
      code: "not_connected",
      message: "Start is after the end on the timeline.",
    };
  }

  const eventIds = new Set(order.slice(iFrom, iTo + 1));
  const edgeIds = new Set<string>();
  for (const e of doc.edges) {
    if (e.rel !== "ordersBefore" && e.rel !== "loopsBack") continue;
    if (eventIds.has(e.from) && eventIds.has(e.to)) edgeIds.add(e.id);
  }

  return {
    status: "valid",
    fromEventId,
    toEventId,
    eventIds,
    edgeIds,
    neighborIds: neighborIdsForPath(doc, eventIds),
  };
}

/** Timeline prominence for a Streams selection: only the marked events, not the events between them. */
export function timelineSelectionPath(
  doc: BlueprintDocument,
  selectedEventIds: readonly string[],
): WorkflowPathResult {
  const span = narrativeSpanOf(doc, selectedEventIds);
  if (!span) return { status: "inactive" };
  const range = computeTimelineRange(doc, span.from, span.to);
  if (range.status !== "valid") return range;
  const eventIds = new Set(selectedEventIds.filter((id) => range.eventIds.has(id)));
  const edgeIds = new Set<string>();
  for (const e of doc.edges) {
    if (e.rel !== "ordersBefore" && e.rel !== "loopsBack") continue;
    if (eventIds.has(e.from) && eventIds.has(e.to)) edgeIds.add(e.id);
  }
  return {
    status: "valid",
    fromEventId: span.from,
    toEventId: span.to,
    eventIds,
    edgeIds,
    neighborIds: neighborIdsForPath(doc, eventIds),
  };
}

export function computeWorkflowPath(
  doc: BlueprintDocument,
  fromEventId: string | null,
  toEventId: string | null,
): WorkflowPathResult {
  if (!fromEventId && !toEventId) return { status: "inactive" };
  if (!fromEventId || !toEventId) {
    return {
      status: "invalid",
      code: "missing_endpoint",
      message: "Set both start and end events to define a workflow.",
    };
  }

  const fromNode = doc.nodes.find((n) => n.id === fromEventId);
  const toNode = doc.nodes.find((n) => n.id === toEventId);
  if (!fromNode || !toNode) {
    return {
      status: "invalid",
      code: "unknown_event",
      message: "Start or end event was not found on this blueprint.",
    };
  }
  if (fromNode.type !== "event" || toNode.type !== "event") {
    return {
      status: "invalid",
      code: "not_events",
      message: "Workflow endpoints must be events.",
    };
  }

  if (fromNode.streamId !== toNode.streamId) {
    const streamName =
      doc.streams.find((s) => s.id === fromNode.streamId)?.name ?? fromNode.streamId;
    return {
      status: "invalid",
      code: "not_connected",
      message: `Start and end must be on the same stream (e.g. ${streamName}).`,
    };
  }

  if (fromEventId === toEventId) {
    const eventIds = new Set<string>([fromEventId]);
    return {
      status: "valid",
      fromEventId,
      toEventId,
      eventIds,
      edgeIds: new Set(),
      neighborIds: neighborIdsForPath(doc, eventIds),
    };
  }

  const adj = streamAdjacency(doc, fromNode.streamId);
  const fromReach = forwardReach(fromEventId, adj);
  if (!fromReach.has(toEventId)) {
    return {
      status: "invalid",
      code: "not_connected",
      message: "No valid path connects start to end on this stream (check then, loop, and pool rules).",
    };
  }

  const toReachBack = backwardReach(toEventId, adj);
  const eventIds = new Set<string>();
  for (const id of fromReach) {
    if (toReachBack.has(id)) eventIds.add(id);
  }

  const edgeIds = new Set<string>();
  for (const e of doc.edges) {
    if (e.rel !== "ordersBefore" && e.rel !== "loopsBack") continue;
    if (eventIds.has(e.from) && eventIds.has(e.to)) edgeIds.add(e.id);
  }

  return {
    status: "valid",
    fromEventId,
    toEventId,
    eventIds,
    edgeIds,
    neighborIds: neighborIdsForPath(doc, eventIds),
  };
}

export type WorkflowEventOption = {
  id: string;
  name: string;
  timelineIndex: number;
  /** Display in From/To fields (disambiguates duplicate event names). */
  label: string;
};

function eventNameCounts(doc: BlueprintDocument): Map<string, number> {
  const counts = new Map<string, number>();
  for (const n of doc.nodes) {
    if (n.type !== "event") continue;
    counts.set(n.name, (counts.get(n.name) ?? 0) + 1);
  }
  return counts;
}

export function workflowEventLabel(
  name: string,
  streamLabel: string,
  timelineIndex: number,
  duplicateName: boolean,
): string {
  const streamSuffix = streamLabel ? ` · ${streamLabel}` : "";
  if (!duplicateName) return `${name}${streamSuffix}`;
  return `${name}${streamSuffix} · step ${timelineIndex + 1}`;
}

export function listWorkflowEventOptions(doc: BlueprintDocument): WorkflowEventOption[] {
  const nameCounts = eventNameCounts(doc);
  const streamOrder = new Map(doc.streams.map((s, i) => [s.id, s.order]));
  return doc.nodes
    .filter((n): n is typeof n & { type: "event" } => n.type === "event")
    .sort(
      (a, b) =>
        (streamOrder.get(a.streamId) ?? 0) - (streamOrder.get(b.streamId) ?? 0) ||
        a.timelineIndex - b.timelineIndex ||
        a.name.localeCompare(b.name),
    )
    .map((n) => {
      const duplicateName = (nameCounts.get(n.name) ?? 0) > 1;
      const streamLabel = doc.streams.find((s) => s.id === n.streamId)?.name ?? "";
      return {
        id: n.id,
        name: n.name,
        timelineIndex: n.timelineIndex,
        label: workflowEventLabel(n.name, streamLabel, n.timelineIndex, duplicateName),
      };
    });
}
