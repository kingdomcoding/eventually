import type { DiagramMode } from "./sessionTypes.js";

/** Legacy persisted values before Design mode. */
const LEGACY_SWIMLANE = "stream";

/** Canonical navigator order: Design → Swimlanes → Timeline. */
export const DIAGRAM_MODE_ORDER: readonly DiagramMode[] = ["design", "swimlane", "timeline"];

export function normalizeDiagramMode(raw: unknown): DiagramMode {
  if (raw === "design") return "design";
  if (raw === "timeline") return "timeline";
  if (raw === "swimlane" || raw === LEGACY_SWIMLANE) return "swimlane";
  return "design";
}

export function nextDiagramMode(mode: DiagramMode): DiagramMode {
  const i = DIAGRAM_MODE_ORDER.indexOf(mode);
  const next = DIAGRAM_MODE_ORDER[(i + 1) % DIAGRAM_MODE_ORDER.length];
  return next ?? "design";
}

export function isSwimlaneMode(mode: DiagramMode): boolean {
  return mode === "swimlane";
}

export function isDesignMode(mode: DiagramMode): boolean {
  return mode === "design";
}

export function isTimelineMode(mode: DiagramMode): boolean {
  return mode === "timeline";
}
