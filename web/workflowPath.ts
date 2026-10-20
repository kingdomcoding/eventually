import type { BlueprintDocument } from "@schema/document.js";
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

function thenAdjacency(doc: BlueprintDocument): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const e of doc.edges) {
    if (e.rel !== "ordersBefore") continue;
    const list = adj.get(e.from) ?? [];
    list.push(e.to);
    adj.set(e.from, list);
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

  if (fromNode.swimlaneId !== toNode.swimlaneId) {
    const streamName =
      doc.swimlanes.find((s) => s.id === fromNode.swimlaneId)?.name ?? fromNode.swimlaneId;
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

  const adj = thenAdjacency(doc);
  const fromReach = forwardReach(fromEventId, adj);
  if (!fromReach.has(toEventId)) {
    return {
      status: "invalid",
      code: "not_connected",
      message: "No then-chain connects start to end. Start must come before end.",
    };
  }

  const toReachBack = backwardReach(toEventId, adj);
  const eventIds = new Set<string>();
  for (const id of fromReach) {
    if (toReachBack.has(id)) eventIds.add(id);
  }

  const edgeIds = new Set<string>();
  for (const e of doc.edges) {
    if (e.rel !== "ordersBefore") continue;
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
  const streamOrder = new Map(doc.swimlanes.map((s, i) => [s.id, s.order]));
  return doc.nodes
    .filter((n): n is typeof n & { type: "event" } => n.type === "event")
    .sort(
      (a, b) =>
        (streamOrder.get(a.swimlaneId) ?? 0) - (streamOrder.get(b.swimlaneId) ?? 0) ||
        a.timelineIndex - b.timelineIndex ||
        a.name.localeCompare(b.name),
    )
    .map((n) => {
      const duplicateName = (nameCounts.get(n.name) ?? 0) > 1;
      const streamLabel = doc.swimlanes.find((s) => s.id === n.swimlaneId)?.name ?? "";
      return {
        id: n.id,
        name: n.name,
        timelineIndex: n.timelineIndex,
        label: workflowEventLabel(n.name, streamLabel, n.timelineIndex, duplicateName),
      };
    });
}
