import type { BlueprintDocument } from "./document.js";
import type { BlueprintNode } from "./nodes.js";

/**
 * Read model for the next step (canvas UI): group nodes by band/lane/timeline
 * without mutating the document.
 */
export type CanvasLayer = {
  swimlaneId: string;
  swimlaneName: string;
  band: "ui" | "commandView" | "events" | "integration";
  nodes: BlueprintNode[];
};

export type CanvasIndex = {
  meta: BlueprintDocument["meta"];
  /** UI band: screens (and integrations in ui if any). */
  uiLayers: CanvasLayer[];
  /** Timeline: events, commands, views ordered by timelineIndex where applicable. */
  timelineEvents: BlueprintNode[];
  edges: BlueprintDocument["edges"];
  nodesById: Record<string, BlueprintNode>;
};

export function indexForCanvas(doc: BlueprintDocument): CanvasIndex {
  const laneById = new Map(doc.swimlanes.map((s) => [s.id, s]));
  const nodesById = Object.fromEntries(doc.nodes.map((n) => [n.id, n])) as Record<
    string,
    BlueprintNode
  >;

  const sortedLanes = [...doc.swimlanes].sort((a, b) => a.order - b.order);

  const uiLayers: CanvasLayer[] = sortedLanes.map((s) => ({
    swimlaneId: s.id,
    swimlaneName: s.name,
    band: s.band,
    nodes:
      doc.nodes.filter((n) => n.swimlaneId === s.id),
  }));

  const timelineEvents = doc.nodes
    .filter((n): n is BlueprintNode & { type: "event" } => n.type === "event")
    .sort((a, b) => a.timelineIndex - b.timelineIndex);

  void laneById;

  return {
    meta: doc.meta,
    uiLayers,
    timelineEvents,
    edges: doc.edges,
    nodesById,
  };
}
