import type { SwimlaneBand } from "@schema/document.js";

export const BAND_LABEL: Record<SwimlaneBand, string> = {
  ui: "Screens",
  commandView: "Commands · views",
  events: "Events",
  integration: "Integration",
};

export function swimlaneRowLabel(band: SwimlaneBand, laneName: string): string {
  if (band === "ui" || band === "events" || band === "commandView") return laneName;
  return BAND_LABEL[band];
}

export function swimlaneRowLabelNamed(band: SwimlaneBand): boolean {
  return band === "ui" || band === "events" || band === "commandView";
}
