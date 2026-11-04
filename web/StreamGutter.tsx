import { memo, useMemo } from "react";
import type { StreamBand } from "@schema/document.js";
import type { StreamRow } from "./layout.js";
import { STREAM_GUTTER } from "./layout.js";
import { BAND_LABEL } from "./streamLabels.js";
import type { GutterEmphasisState } from "./gutterEmphasis.js";
import {
  bandHasVisibleGutterRows,
  bandHeaderEmphasis,
  gutterRowVisible,
  upperCollapsibleBandsHidden,
  visibleGutterDividers,
} from "./gutterEmphasis.js";
import { streamRowLabel, streamRowLabelNamed } from "./streamLabels.js";
import {
  allLaneRowsScreen,
  bandGapScreen,
  bandGapsFromRows,
  rectIntersectsViewport,
  shouldShowGapLabel,
  type FlowViewport,
} from "./gutterLayout.js";

export type StreamGutterProps = {
  rows: StreamRow[];
  viewport: FlowViewport;
  gutterHeight: number;
  emphasis: GutterEmphasisState;
  showAll: boolean;
  bandLabelOverrides?: Partial<Record<StreamBand, string>>;
  /** Timeline: row tags only — no band-gap labels or band chips on rows. */
  hideBandLabels?: boolean;
  /** Streams mode: event-stream rows that contain a marked event. */
  selectedStreamIds?: ReadonlySet<string>;
  /** Streams mode: mark or clear every event on this stream. */
  onSelectStream?: (streamId: string) => void;
};

function emphasisClass(level: "active" | "present" | "idle"): string {
  return `lane-gutter-emphasis--${level}`;
}

function bandClass(band: StreamBand): string {
  return `lane-gutter-band--${band}`;
}

function StreamGutterComponent({
  rows,
  viewport,
  gutterHeight,
  emphasis,
  showAll,
  bandLabelOverrides,
  hideBandLabels = false,
  selectedStreamIds,
  onSelectStream,
}: StreamGutterProps) {
  const bandLabel = (band: StreamBand) => bandLabelOverrides?.[band] ?? BAND_LABEL[band];
  const laneScreens = useMemo(() => allLaneRowsScreen(rows, viewport), [rows, viewport]);

  const gapScreens = useMemo(() => {
    return bandGapsFromRows(rows).map((gap) => bandGapScreen(gap, viewport));
  }, [rows, viewport]);

  const gapLabelVisible = useMemo(() => {
    const map = new Map<StreamBand, boolean>();
    for (const gap of gapScreens) {
      if (!bandHasVisibleGutterRows(rows, gap.band, emphasis.byLaneTier, showAll)) {
        map.set(gap.band, false);
        continue;
      }
      map.set(
        gap.band,
        shouldShowGapLabel(gap.height, gap.top, gutterHeight),
      );
    }
    return map;
  }, [gapScreens, gutterHeight, emphasis.byLaneTier, showAll]);

  const bandChipRowId = useMemo(() => {
    const map = new Map<StreamBand, string>();
    for (const row of rows) {
      if (map.has(row.band)) continue;
      const tier = emphasis.byLaneTier.get(row.id) ?? "hidden";
      if (gutterRowVisible(row.band, tier, showAll)) {
        map.set(row.band, row.id);
      }
    }
    return map;
  }, [rows, emphasis.byLaneTier, showAll]);

  const dividers = useMemo(
    () => visibleGutterDividers(rows, viewport, emphasis.byLaneTier, showAll),
    [rows, viewport, emphasis.byLaneTier, showAll],
  );

  const timelineOnly = useMemo(
    () => upperCollapsibleBandsHidden(rows, emphasis.byLaneTier, showAll),
    [rows, emphasis.byLaneTier, showAll],
  );

  return (
    <div
      className={`lane-gutter${timelineOnly ? " lane-gutter--timeline-only" : ""}`}
      style={{ width: STREAM_GUTTER }}
      aria-hidden
    >
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

      {!hideBandLabels
        ? gapScreens.map((gap) => {
            if (!gapLabelVisible.get(gap.band)) return null;
            if (!rectIntersectsViewport(gap.top, gap.height, gutterHeight)) return null;
            const bandEm = emphasis.byBand.get(gap.band) ?? "idle";
            return (
              <div
                key={`gap-${gap.band}`}
                className={`lane-gutter-band-gap ${bandClass(gap.band)} ${emphasisClass(bandHeaderEmphasis(bandEm))}`}
                style={{ top: gap.top, height: gap.height }}
              >
                <span className="lane-gutter-band-gap__label">{bandLabel(gap.band)}</span>
              </div>
            );
          })
        : null}

      <div className="lane-gutter-rows">
        {rows.map((row, i) => {
          const lane = laneScreens[i];
          if (!lane) return null;
          if (!rectIntersectsViewport(lane.top, lane.height, gutterHeight)) return null;

          const laneTier = emphasis.byLaneTier.get(row.id) ?? "hidden";
          if (!gutterRowVisible(row.band, laneTier, showAll)) return null;

          const named = streamRowLabelNamed(row.band);
          const selectable = Boolean(onSelectStream && row.band === "events");
          const streamSelected = selectedStreamIds?.has(row.id) ?? false;
          const rowEm = emphasis.byLaneId.get(row.id) ?? "idle";
          const showBandChip =
            !hideBandLabels &&
            bandChipRowId.get(row.band) === row.id &&
            !gapLabelVisible.get(row.band);
          const bandEm = emphasis.byBand.get(row.band) ?? "idle";

          return (
            <div
              key={row.id}
              className={`lane-gutter-row ${bandClass(row.band)} ${emphasisClass(rowEm)}${streamSelected ? " is-selected" : ""}`}
              style={{ top: lane.top, height: lane.height }}
            >
              {showBandChip ? (
                <div
                  className={`lane-gutter-band-chip ${emphasisClass(bandHeaderEmphasis(bandEm))}`}
                >
                  {bandLabel(row.band)}
                </div>
              ) : null}
              {selectable ? (
                <button
                  type="button"
                  className={`lane-gutter-label lane-gutter-select${named ? " lane-gutter-label--named" : ""}`}
                  aria-pressed={streamSelected}
                  onClick={(event) => {
                    if (event.detail > 1) return;
                    onSelectStream?.(row.id);
                  }}
                  onDoubleClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                >
                  <span className="lane-gutter-label__title">{streamRowLabel(row.band, row.name)}</span>
                  {row.streamPattern ? (
                    <span className="lane-gutter-label__pattern">{row.streamPattern}</span>
                  ) : null}
                </button>
              ) : (
                <div className={`lane-gutter-label${named ? " lane-gutter-label--named" : ""}`}>
                  <span className="lane-gutter-label__title">{streamRowLabel(row.band, row.name)}</span>
                  {row.streamPattern ? (
                    <span className="lane-gutter-label__pattern">{row.streamPattern}</span>
                  ) : null}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const StreamGutter = memo(StreamGutterComponent);
