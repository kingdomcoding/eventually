import type { BlueprintDocument, SwimlaneBand } from "@schema/document.js";
import type { SwimlaneRow } from "./layout.js";
import { BAND_GAP } from "./layout.js";
import { flowYToScreenY, type FlowViewport, type GutterDivider } from "./gutterLayout.js";
import { BAND_LABEL } from "./swimlaneLabels.js";
import { GUTTER_COLLAPSIBLE_BANDS } from "./swimlaneLabels.js";
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
  byLaneTier: Map<string, DisplayTier>;
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

function maxEmphasis(a: GutterEmphasis, b: GutterEmphasis): GutterEmphasis {
  const rank = { idle: 0, present: 1, active: 2 };
  return rank[a] >= rank[b] ? a : b;
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

function emphasisForCollapsibleBand(tier: DisplayTier, showAll: boolean): GutterEmphasis {
  if (showAll) {
    return tier === "hidden" ? "present" : "active";
  }
  if (tier === "hidden") return "idle";
  if (tier === "preview") return "present";
  return "active";
}

function emphasisForEventsBand(tier: DisplayTier, showAll: boolean): GutterEmphasis {
  if (showAll) return tier === "hidden" ? "present" : "active";
  if (tier === "full") return "active";
  if (tier === "preview" || tier === "context") return "present";
  return "active";
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

export function computeGutterEmphasis(
  doc: BlueprintDocument,
  state: FocusState,
  previewPhase: PreviewPhase,
): GutterEmphasisState {
  const byLaneId = new Map<string, GutterEmphasis>();
  const byLaneTier = new Map<string, DisplayTier>();

  for (const lane of doc.swimlanes) {
    const tier = maxTierInLane(doc, lane.id, state, previewPhase);
    byLaneTier.set(lane.id, tier);

    if (GUTTER_COLLAPSIBLE_BANDS.has(lane.band)) {
      byLaneId.set(lane.id, emphasisForCollapsibleBand(tier, state.showAll));
    } else {
      byLaneId.set(lane.id, emphasisForEventsBand(tier, state.showAll));
    }
  }

  const byBand = recomputeBands(doc, byLaneId);

  return { byLaneId, byLaneTier, byBand };
}

/** Whether a gutter row should render (collapsible bands hide when tier is hidden). */
export function gutterRowVisible(band: SwimlaneBand, maxTier: DisplayTier, showAll: boolean): boolean {
  if (!GUTTER_COLLAPSIBLE_BANDS.has(band)) return true;
  if (showAll) return true;
  return maxTier !== "hidden";
}

export function bandHasVisibleGutterRows(
  rows: SwimlaneRow[],
  band: SwimlaneBand,
  byLaneTier: Map<string, DisplayTier>,
  showAll: boolean,
): boolean {
  if (showAll) return rows.some((r) => r.band === band);
  for (const row of rows) {
    if (row.band !== band) continue;
    if (gutterRowVisible(band, byLaneTier.get(row.id) ?? "hidden", showAll)) return true;
  }
  return false;
}

function rowGutterVisible(
  rows: SwimlaneRow[],
  index: number,
  byLaneTier: Map<string, DisplayTier>,
  showAll: boolean,
): boolean {
  const row = rows[index];
  if (!row) return false;
  return gutterRowVisible(row.band, byLaneTier.get(row.id) ?? "hidden", showAll);
}

/** Dividers only when both adjacent lanes/bands are visible in the gutter (no ghost lines above Events). */
export function visibleGutterDividers(
  rows: SwimlaneRow[],
  viewport: FlowViewport,
  byLaneTier: Map<string, DisplayTier>,
  showAll: boolean,
): GutterDivider[] {
  const out: GutterDivider[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    if (i > 0 && rows[i - 1]!.band !== row.band) {
      const prevBand = rows[i - 1]!.band;
      const prevVisible = bandHasVisibleGutterRows(rows, prevBand, byLaneTier, showAll);
      const nextVisible = bandHasVisibleGutterRows(rows, row.band, byLaneTier, showAll);
      if (prevVisible && nextVisible) {
        const gapMid = rows[i - 1]!.yLine + BAND_GAP / 2;
        out.push({ top: flowYToScreenY(gapMid, viewport), kind: "band" });
      }
    }
    if (i < rows.length - 1 && rows[i + 1]!.band === row.band) {
      if (rowGutterVisible(rows, i, byLaneTier, showAll) && rowGutterVisible(rows, i + 1, byLaneTier, showAll)) {
        out.push({ top: flowYToScreenY(row.yLine, viewport), kind: "row" });
      }
    }
  }
  return out;
}

export function upperCollapsibleBandsHidden(
  rows: SwimlaneRow[],
  byLaneTier: Map<string, DisplayTier>,
  showAll: boolean,
): boolean {
  if (showAll) return false;
  return (
    !bandHasVisibleGutterRows(rows, "ui", byLaneTier, showAll) &&
    !bandHasVisibleGutterRows(rows, "commandView", byLaneTier, showAll)
  );
}
