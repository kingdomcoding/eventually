import type { BlueprintDocument } from "@schema/document.js";

export const DETAIL_EDGE_RELS = new Set(["issues", "produces", "updates", "rendersOn"]);

export type GraphIndex = {
  detailAdj: Map<string, Set<string>>;
  viewFedBy: Map<string, string[]>;
};

let cache: { doc: BlueprintDocument; index: GraphIndex } | null = null;

export function getGraphIndex(doc: BlueprintDocument): GraphIndex {
  if (cache?.doc === doc) return cache.index;
  const detailAdj = new Map<string, Set<string>>();

  const link = (a: string, b: string) => {
    if (!detailAdj.has(a)) detailAdj.set(a, new Set());
    if (!detailAdj.has(b)) detailAdj.set(b, new Set());
    detailAdj.get(a)!.add(b);
    detailAdj.get(b)!.add(a);
  };

  for (const e of doc.edges) {
    if (!DETAIL_EDGE_RELS.has(e.rel)) continue;
    link(e.from, e.to);
  }

  const viewFedBy = new Map<string, string[]>();
  for (const n of doc.nodes) {
    if (n.type === "view") viewFedBy.set(n.id, [...n.fedBy]);
  }

  const index = { detailAdj, viewFedBy };
  cache = { doc, index };
  return index;
}

function nodeById(doc: BlueprintDocument, id: string) {
  return doc.nodes.find((n) => n.id === id);
}

/** Single-event display cluster (commands, views, screens for one event). */
export function eventDetailCluster(doc: BlueprintDocument, eventId: string): Set<string> {
  const ids = new Set<string>([eventId]);

  for (const n of doc.nodes) {
    if (n.type === "command" && n.produces.includes(eventId)) ids.add(n.id);
  }

  for (const e of doc.edges) {
    if (e.rel === "updates" && e.from === eventId) ids.add(e.to);
  }

  for (const n of doc.nodes) {
    if (n.type === "view" && n.fedBy.includes(eventId)) ids.add(n.id);
  }

  const commandIds = new Set(
    [...ids].filter((id) => doc.nodes.find((n) => n.id === id)?.type === "command"),
  );
  const viewIds = new Set(
    [...ids].filter((id) => doc.nodes.find((n) => n.id === id)?.type === "view"),
  );

  for (const e of doc.edges) {
    if (e.rel === "issues" && commandIds.has(e.to)) ids.add(e.from);
    if (e.rel === "rendersOn" && viewIds.has(e.from)) ids.add(e.to);
  }

  return ids;
}

function commandEmphasisClosure(doc: BlueprintDocument, commandId: string): Set<string> {
  const ids = new Set<string>([commandId]);
  for (const e of doc.edges) {
    if (e.rel === "issues" && e.to === commandId) ids.add(e.from);
    if (e.rel === "produces" && e.from === commandId) ids.add(e.to);
  }
  return ids;
}

function viewEmphasisClosure(doc: BlueprintDocument, viewId: string): Set<string> {
  const ids = new Set<string>([viewId]);
  const view = nodeById(doc, viewId);
  if (view?.type === "view") {
    for (const eventId of view.fedBy) ids.add(eventId);
  }
  for (const e of doc.edges) {
    if (e.rel === "updates" && e.to === viewId) ids.add(e.from);
    if (e.rel === "rendersOn" && e.from === viewId) ids.add(e.to);
  }
  return ids;
}

/** Screen focus: screen plus commands/views on it — no events. */
function screenEmphasisClosure(doc: BlueprintDocument, screenId: string): Set<string> {
  const ids = new Set<string>([screenId]);
  for (const e of doc.edges) {
    if (e.rel === "issues" && e.from === screenId) ids.add(e.to);
    if (e.rel === "rendersOn" && e.to === screenId) ids.add(e.from);
  }
  return ids;
}

/** Nodes at full emphasis for a focus anchor (opacity / animation neighborhood). */
export function focusEmphasisClosure(doc: BlueprintDocument, anchorId: string): Set<string> {
  const node = nodeById(doc, anchorId);
  if (!node) return new Set();

  switch (node.type) {
    case "event":
      return eventDetailCluster(doc, anchorId);
    case "command":
      return commandEmphasisClosure(doc, anchorId);
    case "view":
      return viewEmphasisClosure(doc, anchorId);
    case "screen":
      return screenEmphasisClosure(doc, anchorId);
    default:
      return new Set([anchorId]);
  }
}

function detailNeighbors(index: GraphIndex, nodeId: string): Iterable<string> {
  return index.detailAdj.get(nodeId) ?? [];
}

/** Event-anchored fit: BFS on detail edges + shared views via fedBy. */
function focusFitClosureFromEvent(doc: BlueprintDocument, eventId: string): Set<string> {
  const index = getGraphIndex(doc);
  const result = new Set<string>();
  const queue: string[] = [eventId];

  while (queue.length > 0) {
    const id = queue.pop()!;
    if (result.has(id)) continue;
    result.add(id);

    for (const neighbor of detailNeighbors(index, id)) {
      if (!result.has(neighbor)) queue.push(neighbor);
    }

    const node = doc.nodes.find((n) => n.id === id);
    if (node?.type === "view") {
      for (const fedEventId of index.viewFedBy.get(id) ?? []) {
        if (!result.has(fedEventId)) queue.push(fedEventId);
      }
    }
  }

  return result;
}

/** Camera fit + edge animation closure for any focus anchor. */
export function focusFitClosure(doc: BlueprintDocument, anchorId: string): Set<string> {
  const node = nodeById(doc, anchorId);
  if (!node) return new Set();

  switch (node.type) {
    case "event":
      return focusFitClosureFromEvent(doc, anchorId);
    case "view":
      return focusFitClosureFromEvent(doc, anchorId);
    case "command":
    case "screen":
      return focusEmphasisClosure(doc, anchorId);
    default:
      return new Set([anchorId]);
  }
}

export function focusAnimateEdgeClosure(doc: BlueprintDocument, anchorId: string): Set<string> {
  return focusFitClosure(doc, anchorId);
}

export function eventTimelineNodeIds(doc: BlueprintDocument): string[] {
  return doc.nodes.filter((n) => n.type === "event").map((n) => n.id);
}

export function allStickyNodeIds(doc: BlueprintDocument): string[] {
  return doc.nodes.map((n) => n.id);
}
