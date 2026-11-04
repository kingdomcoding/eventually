import type { DiagramMode } from "./sessionTypes.js";

/** Persisted before the mode was renamed from swimlanes to streams. */
const LEGACY_MODE = "swimlane";

/** Canonical navigator order: Design → Streams → Timeline. */
export const DIAGRAM_MODE_ORDER: readonly DiagramMode[] = ["design", "stream", "timeline"];

export function normalizeDiagramMode(raw: unknown): DiagramMode {
  if (raw === "design") return "design";
  if (raw === "timeline") return "timeline";
  if (raw === "stream" || raw === LEGACY_MODE) return "stream";
  return "design";
}

export function nextDiagramMode(mode: DiagramMode): DiagramMode {
  const i = DIAGRAM_MODE_ORDER.indexOf(mode);
  const next = DIAGRAM_MODE_ORDER[(i + 1) % DIAGRAM_MODE_ORDER.length];
  return next ?? "design";
}

export function isStreamMode(mode: DiagramMode): boolean {
  return mode === "stream";
}

export function isDesignMode(mode: DiagramMode): boolean {
  return mode === "design";
}

export function isTimelineMode(mode: DiagramMode): boolean {
  return mode === "timeline";
}
