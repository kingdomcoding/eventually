import type { Edge } from "@xyflow/react";
import type { BlueprintDocument } from "@schema/document.js";
import { NODE_W, type NodePosition } from "./layout.js";

const REL_STROKE: Record<string, string> = {
  issues: "#9eb4cc",
  produces: "#5ba3e8",
  updates: "#6fd06f",
  rendersOn: "#9eb4cc",
  ordersBefore: "#f5c542",
  loopsBack: "#b88cff",
  translatesTo: "#ff9f6b",
};

function handlesFor(rel: string): { sourceHandle: string; targetHandle: string } {
  if (rel === "loopsBack") return { sourceHandle: "t-out", targetHandle: "b-in" };
  if (rel === "ordersBefore") return { sourceHandle: "r-out", targetHandle: "l-in" };
  if (rel === "updates") return { sourceHandle: "t-out", targetHandle: "b-in" };
  if (rel === "rendersOn") return { sourceHandle: "t-out", targetHandle: "b-in" };
  return { sourceHandle: "b-out", targetHandle: "t-in" };
}

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

export type BuildEdgesOptions = {
  /** When false, omit stream spine edges (ordersBefore, loopsBack). */
  includeStreamEdges?: boolean;
};

export function buildEdges(
  doc: BlueprintDocument,
  positions: Map<string, NodePosition>,
  options: BuildEdgesOptions = {},
): Edge[] {
  const includeStream = options.includeStreamEdges !== false;
  return doc.edges
    .filter((e) => {
      if (includeStream) return true;
      return e.rel !== "ordersBefore" && e.rel !== "loopsBack";
    })
    .map((e) => {
    const longRange = isLongRangeUpdate(e.rel, e.from, e.to, positions);
    const isTimeline = e.rel === "ordersBefore";
    const isLoop = e.rel === "loopsBack";
    const isPrimary = PRIMARY_RELS.has(e.rel) && !longRange && !isTimeline && !isLoop;

    return {
      id: e.id,
      source: e.from,
      target: e.to,
      type: isLoop ? "smoothstep" : "default",
      zIndex: isPrimary ? 6 : isLoop ? 3 : 2,
      ...handlesFor(e.rel),
      animated: false,
      style: {
        stroke: REL_STROKE[e.rel] ?? "#5a6a7a",
        strokeWidth: isPrimary ? 2.5 : 1.5,
        strokeDasharray: isLoop ? "4 4" : STROKE_DASH,
        opacity: isTimeline || isLoop || longRange ? 0.65 : 0.95,
      },
    };
  });
}
