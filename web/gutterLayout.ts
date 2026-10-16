import type { SwimlaneBand } from "@schema/document.js";
import type { SwimlaneRow } from "./layout.js";
import { BAND_GAP, LANE_ROW_HEIGHT } from "./layout.js";
import { BAND_LABEL } from "./swimlaneLabels.js";

export type FlowViewport = { x: number; y: number; zoom: number };

/** Flow Y → screen Y inside the diagram host (matches React Flow node positioning). */
export function flowYToScreenY(flowY: number, viewport: FlowViewport): number {
  return flowY * viewport.zoom + viewport.y;
}

export function flowLenToScreen(len: number, viewport: FlowViewport): number {
  return len * viewport.zoom;
}

export type LaneRowScreen = {
  laneId: string;
  top: number;
  height: number;
  centerY: number;
};

export function laneRowScreenRect(row: SwimlaneRow, viewport: FlowViewport): LaneRowScreen {
  const top = flowYToScreenY(row.y, viewport);
  const height = flowLenToScreen(LANE_ROW_HEIGHT, viewport);
  return { laneId: row.id, top, height, centerY: top + height / 2 };
}

export function allLaneRowsScreen(rows: SwimlaneRow[], viewport: FlowViewport): LaneRowScreen[] {
  return rows.map((row) => laneRowScreenRect(row, viewport));
}

/** @deprecated Use allLaneRowsScreen */
export function swimlaneRowScreenTops(rows: SwimlaneRow[], viewport: FlowViewport): number[] {
  return rows.map((row) => flowYToScreenY(row.y, viewport));
}

export type BandGapFlow = {
  band: SwimlaneBand;
  yStart: number;
  yEnd: number;
};

export function bandGapsFromRows(rows: SwimlaneRow[]): BandGapFlow[] {
  const gaps: BandGapFlow[] = [];
  for (let i = 0; i < rows.length - 1; i++) {
    const curr = rows[i]!;
    const next = rows[i + 1]!;
    if (curr.band !== next.band) {
      gaps.push({
        band: next.band,
        yStart: curr.yLine,
        yEnd: curr.yLine + BAND_GAP,
      });
    }
  }
  return gaps;
}

export type BandGapScreen = {
  band: SwimlaneBand;
  label: string;
  top: number;
  height: number;
  centerY: number;
};

export function bandGapScreen(gap: BandGapFlow, viewport: FlowViewport): BandGapScreen {
  const top = flowYToScreenY(gap.yStart, viewport);
  const height = flowLenToScreen(BAND_GAP, viewport);
  return {
    band: gap.band,
    label: BAND_LABEL[gap.band],
    top,
    height,
    centerY: top + height / 2,
  };
}

export type GutterDivider = { top: number; kind: "band" | "row" };

export function gutterDividers(rows: SwimlaneRow[], viewport: FlowViewport): GutterDivider[] {
  const out: GutterDivider[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    if (i > 0 && rows[i - 1]!.band !== row.band) {
      const gapMid = rows[i - 1]!.yLine + BAND_GAP / 2;
      out.push({ top: flowYToScreenY(gapMid, viewport), kind: "band" });
    }
    if (i < rows.length - 1 && rows[i + 1]!.band === row.band) {
      out.push({ top: flowYToScreenY(row.yLine, viewport), kind: "row" });
    }
  }
  return out;
}

export function rectIntersectsViewport(top: number, height: number, viewportHeight: number): boolean {
  const bottom = top + height;
  return bottom >= 0 && top <= viewportHeight;
}

export const MIN_GAP_LABEL_HEIGHT_PX = 14;

export function shouldShowGapLabel(gapHeight: number, top: number, gutterHeight: number): boolean {
  if (gapHeight < MIN_GAP_LABEL_HEIGHT_PX) return false;
  return rectIntersectsViewport(top, gapHeight, gutterHeight);
}

export function isFirstRowInBand(rows: SwimlaneRow[], index: number): boolean {
  if (index === 0) return true;
  return rows[index - 1]!.band !== rows[index]!.band;
}

/** Gap before this band (none for first band in document). */
export function gapBeforeBand(rows: SwimlaneRow[], band: SwimlaneBand): BandGapFlow | null {
  const gaps = bandGapsFromRows(rows);
  return gaps.find((g) => g.band === band) ?? null;
}
