import type { SwimlaneBand } from "@schema/document.js";

export const BAND_LABEL: Record<SwimlaneBand, string> = {
  ui: "Users",
  commandView: "Commands · views",
  events: "Streams",
  integration: "Integration",
};

export function swimlaneRowLabel(band: SwimlaneBand, laneName: string): string {
  if (band === "ui" || band === "events" || band === "commandView") return laneName;
  return BAND_LABEL[band];
}

export function swimlaneRowLabelNamed(band: SwimlaneBand): boolean {
  return band === "ui" || band === "events" || band === "commandView";
}

/** Bands whose gutter rows hide when no canvas nodes are visible in that lane. */
export const GUTTER_COLLAPSIBLE_BANDS = new Set<SwimlaneBand>(["ui", "commandView", "integration"]);
