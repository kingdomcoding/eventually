import type { Edge } from "@xyflow/react";
import type { BlueprintDocument } from "@schema/document.js";
import { NODE_W, type NodePosition } from "./layout.js";

const REL_STROKE: Record<string, string> = {
  issues: "#9eb4cc",
  produces: "#5ba3e8",
  updates: "#6fd06f",
  rendersOn: "#9eb4cc",
  redirectsTo: "#8fa3bc",
  ordersBefore: "#f5c542",
  loopsBack: "#b88cff",
};

const REL_LABEL: Record<string, string> = {
  redirectsTo: "redirect",
};

function handlesFor(rel: string): { sourceHandle: string; targetHandle: string } {
  if (rel === "loopsBack") return { sourceHandle: "t-out", targetHandle: "b-in" };
  // Overhead loop: leave the top of the source page and enter the top of the target.
  if (rel === "redirectsTo") return { sourceHandle: "t-out", targetHandle: "t-in" };
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
  /** When false, omit command/screen EM edges (issues, produces, …). */
  includeEmEdges?: boolean;
};

export function buildEdges(
  doc: BlueprintDocument,
  positions: Map<string, NodePosition>,
  options: BuildEdgesOptions = {},
): Edge[] {
  const includeStream = options.includeStreamEdges !== false;
  const includeEm = options.includeEmEdges !== false;
  return doc.edges
    .filter((e) => {
      if (e.rel === "ordersBefore" || e.rel === "loopsBack") {
        return includeStream;
      }
      if (!includeEm) return false;
      return true;
    })
    .map((e) => {
    const longRange = isLongRangeUpdate(e.rel, e.from, e.to, positions);
    const isTimeline = e.rel === "ordersBefore";
    const isLoop = e.rel === "loopsBack";
    const isPrimary = PRIMARY_RELS.has(e.rel) && !longRange && !isTimeline && !isLoop;

    const label = REL_LABEL[e.rel];
    const isRedirect = e.rel === "redirectsTo";

    return {
      id: e.id,
      source: e.from,
      target: e.to,
      // Redirects arc above both UI cards (top → top smoothstep), not across the gap.
      type: isLoop || isRedirect ? "smoothstep" : "default",
      zIndex: isPrimary ? 6 : isLoop || isRedirect ? 3 : 2,
      ...handlesFor(e.rel),
      animated: false,
      ...(isRedirect
        ? {
            pathOptions: {
              offset: 56,
              borderRadius: 18,
            },
          }
        : {}),
      ...(label
        ? {
            label,
            labelStyle: {
              fill: "#c5d0de",
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: "0.02em",
            },
            labelBgStyle: { fill: "#0f1419", fillOpacity: 0.88 },
            labelBgPadding: [4, 2] as [number, number],
            labelBgBorderRadius: 2,
          }
        : {}),
      style: {
        stroke: REL_STROKE[e.rel] ?? "#5a6a7a",
        strokeWidth: isPrimary ? 2.5 : 1.5,
        strokeDasharray: isLoop || isRedirect ? "5 5" : STROKE_DASH,
        opacity: isTimeline || isLoop || longRange ? 0.65 : isRedirect ? 0.85 : 0.95,
      },
    };
  });
}
