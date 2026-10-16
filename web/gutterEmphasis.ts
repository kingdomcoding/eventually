import type { BlueprintDocument, SwimlaneBand } from "@schema/document.js";
import type { SwimlaneRow } from "./layout.js";
import { BAND_LABEL } from "./swimlaneLabels.js";
import type { DisplayTier, FocusState, PreviewPhase } from "./viewMode.js";
import { nodeDisplayTier } from "./viewMode.js";

export type GutterEmphasis = "active" | "present" | "idle";

export const GUTTER_EMPHASIS_OPACITY = {
  active: 1,
  present: 0.48,
  idle: 0.4,
} as const;

export type BandBlock = {
  band: SwimlaneBand;
  headerLabel: string;
  laneIds: string[];
  yStart: number;
  yEnd: number;
};

export type GutterEmphasisState = {
  byLaneId: Map<string, GutterEmphasis>;
  byBand: Map<SwimlaneBand, GutterEmphasis>;
};

const TIER_RANK: Record<DisplayTier, number> = {
  hidden: 0,
  context: 1,
  preview: 2,
  full: 3,
};

function maxTier(a: DisplayTier, b: DisplayTier): DisplayTier {
  return TIER_RANK[a] >= TIER_RANK[b] ? a : b;
}

function tierToEmphasis(tier: DisplayTier): GutterEmphasis {
  if (tier === "full") return "active";
  if (tier === "preview" || tier === "context") return "present";
  return "idle";
}

function maxEmphasis(a: GutterEmphasis, b: GutterEmphasis): GutterEmphasis {
  const rank = { idle: 0, present: 1, active: 2 };
  return rank[a] >= rank[b] ? a : b;
}

function recomputeBands(
  doc: BlueprintDocument,
  byLaneId: Map<string, GutterEmphasis>,
): Map<SwimlaneBand, GutterEmphasis> {
  const byBand = new Map<SwimlaneBand, GutterEmphasis>();
  for (const lane of doc.swimlanes) {
    const em = byLaneId.get(lane.id) ?? "idle";
    byBand.set(lane.band, maxEmphasis(byBand.get(lane.band) ?? "idle", em));
  }
  return byBand;
}

/** Band strip in gutter: one step louder than row aggregate for scanability. */
export function bandHeaderEmphasis(em: GutterEmphasis): GutterEmphasis {
  if (em === "present") return "active";
  return em;
}

export function isPureStory(state: FocusState): boolean {
  return !state.showAll && state.openEventIds.size === 0 && !state.focusAnchorId;
}

export function bandBlocksFromRows(rows: SwimlaneRow[]): BandBlock[] {
  const blocks: BandBlock[] = [];
  let i = 0;
  while (i < rows.length) {
    const band = rows[i]!.band;
    const bandRows: SwimlaneRow[] = [];
    while (i < rows.length && rows[i]!.band === band) {
      bandRows.push(rows[i]!);
      i++;
    }
    blocks.push({
      band,
      headerLabel: BAND_LABEL[band],
      laneIds: bandRows.map((r) => r.id),
      yStart: bandRows[0]!.y,
      yEnd: bandRows[bandRows.length - 1]!.yLine,
    });
  }
  return blocks;
}

function maxTierInLane(
  doc: BlueprintDocument,
  laneId: string,
  state: FocusState,
  previewPhase: PreviewPhase,
): DisplayTier {
  let best: DisplayTier = "hidden";
  for (const n of doc.nodes) {
    if (n.swimlaneId !== laneId) continue;
    best = maxTier(best, nodeDisplayTier(doc, n.id, state, previewPhase));
  }
  return best;
}

export function computeGutterEmphasis(
  doc: BlueprintDocument,
  state: FocusState,
  previewPhase: PreviewPhase,
): GutterEmphasisState {
  const byLaneId = new Map<string, GutterEmphasis>();

  for (const lane of doc.swimlanes) {
    const tier = maxTierInLane(doc, lane.id, state, previewPhase);
    byLaneId.set(lane.id, tierToEmphasis(tier));
  }

  if (state.showAll) {
    for (const lane of doc.swimlanes) {
      const em = byLaneId.get(lane.id) ?? "idle";
      byLaneId.set(lane.id, em === "idle" ? "present" : "active");
    }
  } else if (isPureStory(state)) {
    for (const lane of doc.swimlanes) {
      if (lane.band !== "events") {
        byLaneId.set(lane.id, "idle");
      }
    }
  }

  const byBand = recomputeBands(doc, byLaneId);

  if (isPureStory(state)) {
    for (const band of ["ui", "commandView", "integration"] as SwimlaneBand[]) {
      if (byBand.has(band)) byBand.set(band, "idle");
    }
  }

  return { byLaneId, byBand };
}
