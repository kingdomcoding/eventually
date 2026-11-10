import type { BlueprintDocument } from "./document.js";
import type { BlueprintNode } from "./nodes.js";

/**
 * Read model for the next step (canvas UI): group nodes by band/lane/timeline
 * without mutating the document.
 */
export type CanvasLayer = {
  streamId: string;
  streamName: string;
  band: "ui" | "commandView" | "events";
  nodes: BlueprintNode[];
};

export type CanvasIndex = {
  meta: BlueprintDocument["meta"];
  /** UI band: screens. */
  uiLayers: CanvasLayer[];
  /** Timeline: events, commands, data tables ordered by timelineIndex where applicable. */
  timelineEvents: BlueprintNode[];
  edges: BlueprintDocument["edges"];
  nodesById: Record<string, BlueprintNode>;
};

export function indexForCanvas(doc: BlueprintDocument): CanvasIndex {
  const laneById = new Map(doc.streams.map((s) => [s.id, s]));
  const nodesById = Object.fromEntries(doc.nodes.map((n) => [n.id, n])) as Record<
    string,
    BlueprintNode
  >;

  const sortedLanes = [...doc.streams].sort((a, b) => a.order - b.order);

  const uiLayers: CanvasLayer[] = sortedLanes.map((s) => ({
    streamId: s.id,
    streamName: s.name,
    band: s.band,
    nodes:
      doc.nodes.filter((n) => n.streamId === s.id),
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
