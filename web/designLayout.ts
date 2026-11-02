import type { BlueprintDocument } from "@schema/document.js";
import {
  BAND_GAP,
  INTER_COL_GAP,
  LANE_ROW_HEIGHT,
  MARGIN_X,
  NODE_W,
  SCREEN_STAGGER_X,
  SWIMLANE_GUTTER,
  yForLaneRow,
  type LayoutResult,
  type NodePosition,
  type SwimlaneRow,
} from "./layoutMetrics.js";

/** Place screens in user-category rows only (Design projection). */
export function computeDesignLayout(doc: BlueprintDocument): LayoutResult {
  const lanes = doc.swimlanes.filter((s) => s.band === "ui").sort((a, b) => a.order - b.order);
  const swimlaneRows: SwimlaneRow[] = [];
  let y = 48;

  for (const lane of lanes) {
    swimlaneRows.push({
      id: lane.id,
      name: lane.name,
      band: "ui",
      order: lane.order,
      y,
      yLine: y + LANE_ROW_HEIGHT,
      height: LANE_ROW_HEIGHT,
    });
    y += LANE_ROW_HEIGHT;
  }
  y += BAND_GAP;

  const yByLane = new Map(swimlaneRows.map((r) => [r.id, r.y]));
  const positions = new Map<string, NodePosition>();

  const screens = doc.nodes
    .filter((n) => n.type === "screen")
    .sort((a, b) => {
      const laneA = lanes.find((l) => l.id === a.swimlaneId)?.order ?? 0;
      const laneB = lanes.find((l) => l.id === b.swimlaneId)?.order ?? 0;
      if (laneA !== laneB) return laneA - laneB;
      const sliceCmp = a.sliceId.localeCompare(b.sliceId);
      if (sliceCmp !== 0) return sliceCmp;
      return a.name.localeCompare(b.name);
    });

  const colInLane = new Map<string, number>();
  for (const screen of screens) {
    const laneY = yByLane.get(screen.swimlaneId) ?? swimlaneRows[0]?.y ?? 48;
    const col = colInLane.get(screen.swimlaneId) ?? 0;
    colInLane.set(screen.swimlaneId, col + 1);
    const x = MARGIN_X + SWIMLANE_GUTTER + col * (NODE_W + INTER_COL_GAP + SCREEN_STAGGER_X * 0.25);
    positions.set(screen.id, { x, y: yForLaneRow(laneY) });
  }

  return { positions, swimlaneRows };
}
