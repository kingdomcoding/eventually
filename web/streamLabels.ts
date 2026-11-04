import type { StreamBand } from "@schema/document.js";

export const BAND_LABEL: Record<StreamBand, string> = {
  ui: "User categories",
  commandView: "Commands · Views",
  events: "Streams",
};

/** Band title for the ui band when Design mode shows only category rows. */
export const BAND_LABEL_DESIGN_UI = "Design";

export const BAND_LABEL_TIMELINE: Record<StreamBand, string> = {
  ...BAND_LABEL,
  ui: "Triggers",
  events: "Events",
};

export function streamRowLabel(band: StreamBand, laneName: string): string {
  if (band === "ui" || band === "events" || band === "commandView") return laneName;
  return BAND_LABEL[band];
}

export function streamRowLabelNamed(band: StreamBand): boolean {
  return band === "ui" || band === "events" || band === "commandView";
}

/** Bands whose gutter rows hide when no canvas nodes are visible in that lane. */
export const GUTTER_COLLAPSIBLE_BANDS = new Set<StreamBand>(["ui", "commandView"]);
