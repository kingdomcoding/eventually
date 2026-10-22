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
