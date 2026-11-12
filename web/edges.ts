import { MarkerType, type Edge } from "@xyflow/react";
import type { BlueprintDocument } from "@schema/document.js";
import { NODE_W, type NodePosition } from "./layout.js";

/** Face color of each sticky, so an arrow can match the element it leaves. */
const TRIGGER_FACE = "#e7eef6";

export const SOURCE_STROKE: Record<string, string> = {
  event: "#f8d04d",
  command: "#5ba3e8",
  dataTable: "#6fd06f",
  screen: "#f4f6fa",
  trigger: TRIGGER_FACE,
  automation: TRIGGER_FACE,
};

const REL_LABEL: Record<string, string> = {
  redirectsTo: "redirect",
};

function handlesFor(rel: string): { sourceHandle: string; targetHandle: string } {
  if (rel === "loopsBack") return { sourceHandle: "t-out", targetHandle: "b-in" };
  // Redirects: leave the source on the right, enter the target on top (Bezier).
  if (rel === "redirectsTo") return { sourceHandle: "r-out", targetHandle: "t-in" };
  if (rel === "ordersBefore") return { sourceHandle: "r-out", targetHandle: "l-in" };
  if (rel === "updates") return { sourceHandle: "t-out", targetHandle: "b-in" };
  if (rel === "rendersOn") return { sourceHandle: "t-out", targetHandle: "b-in" };
  // Data table (mid) → automation (UI): leave top of table, enter bottom of gear.
  if (rel === "observes") return { sourceHandle: "t-out", targetHandle: "b-in" };
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

const PRIMARY_RELS = new Set(["issues", "produces", "updates", "rendersOn", "observes"]);
const STROKE_DASH = "7 5";

/** Deeper handle-normal entry so the shaft meets the arrowhead cleanly. */
export const VERTICAL_ENTRY_EDGE_TYPE = "verticalEntry";

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
    // Event→data table (updates) stays main-line weight even when the span is long —
    // longRange only softens opacity, never stroke/arrow size.
    const isPrimary = PRIMARY_RELS.has(e.rel) && !isTimeline && !isLoop;

    const label = REL_LABEL[e.rel];
    const isRedirect = e.rel === "redirectsTo";
    const sourceType = doc.nodes.find((n) => n.id === e.from)?.type;
    const stroke = (sourceType && SOURCE_STROKE[sourceType]) || "#5a6a7a";

    return {
      id: e.id,
      source: e.from,
      target: e.to,
      // Redirects: Bezier right→top. Loops: smoothstep. All else: deepened Bezier entry.
      type: isLoop ? "smoothstep" : VERTICAL_ENTRY_EDGE_TYPE,
      zIndex: isPrimary ? 6 : isLoop || isRedirect ? 3 : 2,
      ...handlesFor(e.rel),
      // orient:"auto" rotates the arrow to the path's end tangent so the shaft
      // enters the base squarely on Bezier, smoothstep, and redirect edges alike.
      // color matches the edge stroke so arrowheads are not a shared default fill.
      markerEnd: { type: MarkerType.ArrowClosed, orient: "auto", color: stroke },
      animated: false,
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
        stroke,
        strokeWidth: isPrimary ? 2.5 : 1.5,
        strokeDasharray: isLoop || isRedirect ? "5 5" : STROKE_DASH,
        opacity: isTimeline || isLoop || longRange ? 0.65 : isRedirect ? 0.85 : 0.95,
      },
    };
  });
}
