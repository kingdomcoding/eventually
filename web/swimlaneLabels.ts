import type { SwimlaneBand } from "@schema/document.js";

export const BAND_LABEL: Record<SwimlaneBand, string> = {
  ui: "User categories",
  commandView: "Commands · Views",
  events: "Streams",
};

/** Band title for the ui band when Design mode shows only category rows. */
export const BAND_LABEL_DESIGN_UI = "Design";

export const BAND_LABEL_TIMELINE: Record<SwimlaneBand, string> = {
  ...BAND_LABEL,
  ui: "Screens",
  events: "Events",
};

export function swimlaneRowLabel(band: SwimlaneBand, laneName: string): string {
  if (band === "ui" || band === "events" || band === "commandView") return laneName;
  return BAND_LABEL[band];
}

export function swimlaneRowLabelNamed(band: SwimlaneBand): boolean {
  return band === "ui" || band === "events" || band === "commandView";
}

/** Bands whose gutter rows hide when no canvas nodes are visible in that lane. */
export const GUTTER_COLLAPSIBLE_BANDS = new Set<SwimlaneBand>(["ui", "commandView"]);
