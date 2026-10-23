export const SWIMLANE_GUTTER = 200;
export const COL_WIDTH = 340;
export const MARGIN_X = 48;
export const LANE_ROW_HEIGHT = 128;
export const BAND_GAP = 52;
export const SLICE_PAD = 16;
export const NODE_W = 168;
export const NODE_H = 76;

export const GAP_AFTER_COMMAND = 28;
export const INTER_COL_GAP = 32;
export const MIN_COL_WIDTH = NODE_W + 40;
export const SCREEN_STAGGER_X = NODE_W + 24;

export type NodePosition = { x: number; y: number };

export type SwimlaneRow = {
  id: string;
  name: string;
  band: "ui" | "commandView" | "events";
  order: number;
  y: number;
  yLine: number;
  height: number;
  streamPattern?: string;
};

export type LayoutResult = {
  positions: Map<string, NodePosition>;
  swimlaneRows: SwimlaneRow[];
};

export function yForLaneRow(rowY: number, laneHeight: number = LANE_ROW_HEIGHT): number {
  return rowY + (laneHeight - NODE_H) / 2;
}
