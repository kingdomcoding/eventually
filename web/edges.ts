import type { Edge } from "@xyflow/react";
import type { BlueprintDocument } from "@schema/document.js";
import { NODE_W, type NodePosition } from "./layout.js";

const REL_STROKE: Record<string, string> = {
  issues: "#9eb4cc",
  produces: "#5ba3e8",
  updates: "#6fd06f",
  rendersOn: "#9eb4cc",
  ordersBefore: "#f5c542",
  translatesTo: "#ff9f6b",
};

function handlesFor(rel: string): { sourceHandle: string; targetHandle: string } {
  if (rel === "ordersBefore") return { sourceHandle: "r-out", targetHandle: "l-in" };
  if (rel === "updates") return { sourceHandle: "t-out", targetHandle: "b-in" };
  if (rel === "rendersOn") return { sourceHandle: "t-out", targetHandle: "b-in" };
  return { sourceHandle: "b-out", targetHandle: "t-in" };
}

/** Long horizontal separation — de-emphasize (e.g. earlier event → later view). */
function isLongRangeUpdate(
  rel: string,
  from: string,
  to: string,
  positions: Map<string, NodePosition>,
): boolean {
  if (rel !== "updates") return false;
  const a = positions.get(from);
  const b = positions.get(to);
  if (!a || !b) return false;
  return Math.abs(a.x - b.x) > NODE_W * 0.6;
}

const PRIMARY_RELS = new Set(["issues", "produces", "updates", "rendersOn"]);
const STROKE_DASH = "7 5";

export function buildEdges(
  doc: BlueprintDocument,
  positions: Map<string, NodePosition>,
): Edge[] {
  return doc.edges.map((e) => {
    const longRange = isLongRangeUpdate(e.rel, e.from, e.to, positions);
    const isTimeline = e.rel === "ordersBefore";
    const isPrimary = PRIMARY_RELS.has(e.rel) && !longRange && !isTimeline;

    return {
      id: e.id,
      source: e.from,
      target: e.to,
      type: "default",
      zIndex: isPrimary ? 6 : 2,
      ...handlesFor(e.rel),
      animated: false,
      label: isTimeline ? "then" : undefined,
      labelStyle: { fill: "#f5c542", fontSize: 11 },
      labelBgStyle: { fill: "#121a24", fillOpacity: 0.9 },
      style: {
        stroke: REL_STROKE[e.rel] ?? "#5a6a7a",
        strokeWidth: isPrimary ? 2.5 : 1.5,
        strokeDasharray: STROKE_DASH,
        opacity: isTimeline || longRange ? 0.5 : 0.95,
      },
    };
  });
}
