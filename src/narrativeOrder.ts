import type { BlueprintDocument } from "./document.js";
import type { BlueprintNode } from "./nodes.js";

/** Map event id → column index on the global timeline spine. */
export function storyIndexByEventId(doc: BlueprintDocument): Map<string, number> {
  const events = doc.nodes.filter((n): n is BlueprintNode & { type: "event" } => n.type === "event");
  const map = new Map<string, number>();

  const order = doc.meta.narrativeOrder;
  if (order?.length) {
    order.forEach((id, i) => map.set(id, i));
    let next = order.length;
    for (const e of events) {
      if (!map.has(e.id)) {
        map.set(e.id, next++);
      }
    }
    return map;
  }

  const sorted = [...events].sort(
    (a, b) => a.timelineIndex - b.timelineIndex || a.id.localeCompare(b.id),
  );
  sorted.forEach((e, i) => map.set(e.id, i));
  return map;
}

export function storyIndexForEvent(doc: BlueprintDocument, eventId: string): number {
  return storyIndexByEventId(doc).get(eventId) ?? 0;
}

export function orderedNarrativeEventIds(doc: BlueprintDocument): string[] {
  const byIndex = [...storyIndexByEventId(doc).entries()].sort((a, b) => a[1] - b[1]);
  return byIndex.map(([id]) => id);
}

/** Earliest and latest selected events on the narrative spine. */
export function narrativeSpanOf(
  doc: BlueprintDocument,
  eventIds: readonly string[],
): { from: string; to: string } | null {
  const index = storyIndexByEventId(doc);
  let fromId: string | null = null;
  let toId: string | null = null;
  let fromAt = Infinity;
  let toAt = -1;
  for (const id of eventIds) {
    const at = index.get(id);
    if (at == null) continue;
    if (at < fromAt) {
      fromAt = at;
      fromId = id;
    }
    if (at > toAt) {
      toAt = at;
      toId = id;
    }
  }
  if (!fromId || !toId) return null;
  return { from: fromId, to: toId };
}
