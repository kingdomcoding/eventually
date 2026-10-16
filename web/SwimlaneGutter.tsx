import { memo, useMemo } from "react";
import type { SwimlaneBand } from "@schema/document.js";
import type { SwimlaneRow } from "./layout.js";
import { SWIMLANE_GUTTER } from "./layout.js";
import { BAND_LABEL } from "./swimlaneLabels.js";
import type { GutterEmphasisState } from "./gutterEmphasis.js";
import { bandHeaderEmphasis } from "./gutterEmphasis.js";
import { swimlaneRowLabel, swimlaneRowLabelNamed } from "./swimlaneLabels.js";
import {
  allLaneRowsScreen,
  bandGapScreen,
  bandGapsFromRows,
  gutterDividers,
  isFirstRowInBand,
  rectIntersectsViewport,
  shouldShowGapLabel,
  type FlowViewport,
} from "./gutterLayout.js";

export type SwimlaneGutterProps = {
  rows: SwimlaneRow[];
  viewport: FlowViewport;
  gutterHeight: number;
  emphasis: GutterEmphasisState;
};

function emphasisClass(level: "active" | "present" | "idle"): string {
  return `lane-gutter-emphasis--${level}`;
}

function bandClass(band: SwimlaneBand): string {
  return `lane-gutter-band--${band}`;
}

function SwimlaneGutterComponent({ rows, viewport, gutterHeight, emphasis }: SwimlaneGutterProps) {
  const laneScreens = useMemo(() => allLaneRowsScreen(rows, viewport), [rows, viewport]);

  const gapScreens = useMemo(() => {
    return bandGapsFromRows(rows).map((gap) => bandGapScreen(gap, viewport));
  }, [rows, viewport]);

  const gapLabelVisible = useMemo(() => {
    const map = new Map<SwimlaneBand, boolean>();
    for (const gap of gapScreens) {
      map.set(
        gap.band,
        shouldShowGapLabel(gap.height, gap.top, gutterHeight),
      );
    }
    return map;
  }, [gapScreens, gutterHeight]);

  const dividers = useMemo(() => gutterDividers(rows, viewport), [rows, viewport]);

  return (
    <div className="lane-gutter" style={{ width: SWIMLANE_GUTTER }} aria-hidden>
      <div className="lane-gutter-dividers">
        {dividers.map((d, i) =>
          rectIntersectsViewport(d.top, 1, gutterHeight) ? (
            <div
              key={`${d.kind}-${i}`}
              className={`lane-gutter-divider lane-gutter-divider--${d.kind}`}
              style={{ top: d.top }}
            />
          ) : null,
        )}
      </div>

      {gapScreens.map((gap) => {
        if (!gapLabelVisible.get(gap.band)) return null;
        if (!rectIntersectsViewport(gap.top, gap.height, gutterHeight)) return null;
        const bandEm = emphasis.byBand.get(gap.band) ?? "idle";
        return (
          <div
            key={`gap-${gap.band}`}
            className={`lane-gutter-band-gap ${bandClass(gap.band)} ${emphasisClass(bandHeaderEmphasis(bandEm))}`}
            style={{ top: gap.top, height: gap.height }}
          >
            <span className="lane-gutter-band-gap__label">{gap.label}</span>
          </div>
        );
      })}

      <div className="lane-gutter-rows">
        {rows.map((row, i) => {
          const lane = laneScreens[i];
          if (!lane) return null;
          if (!rectIntersectsViewport(lane.top, lane.height, gutterHeight)) return null;

          const named = swimlaneRowLabelNamed(row.band);
          const rowEm = emphasis.byLaneId.get(row.id) ?? "idle";
          const firstInBand = isFirstRowInBand(rows, i);
          const showBandChip = firstInBand && !gapLabelVisible.get(row.band);
          const bandEm = emphasis.byBand.get(row.band) ?? "idle";

          return (
            <div
              key={row.id}
              className={`lane-gutter-row ${bandClass(row.band)} ${emphasisClass(rowEm)}`}
              style={{ top: lane.top, height: lane.height }}
            >
              {showBandChip ? (
                <div
                  className={`lane-gutter-band-chip ${emphasisClass(bandHeaderEmphasis(bandEm))}`}
                >
                  {BAND_LABEL[row.band]}
                </div>
              ) : null}
              <div className={`lane-gutter-label${named ? " lane-gutter-label--named" : ""}`}>
                {swimlaneRowLabel(row.band, row.name)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const SwimlaneGutter = memo(SwimlaneGutterComponent);
