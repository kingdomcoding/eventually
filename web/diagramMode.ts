import type { DiagramMode } from "./sessionTypes.js";

/** Legacy persisted value before Swimlane rename. */
const LEGACY_SWIMLANE = "stream";

export function normalizeDiagramMode(raw: unknown): DiagramMode {
  if (raw === "timeline") return "timeline";
  if (raw === "swimlane" || raw === LEGACY_SWIMLANE) return "swimlane";
  return "swimlane";
}

export function isSwimlaneMode(mode: DiagramMode): boolean {
  return mode === "swimlane";
}
