import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { BlueprintDocumentSchema } from "../src/document.js";
import { computeLayout, BAND_GAP, LANE_ROW_HEIGHT } from "./layout.js";
import {
  allLaneRowsScreen,
  bandGapsFromRows,
  flowLenToScreen,
  laneRowScreenRect,
} from "./gutterLayout.js";

const here = dirname(fileURLToPath(import.meta.url));
const apex = BlueprintDocumentSchema.parse(
  JSON.parse(readFileSync(join(here, "../samples/apex-bee.json"), "utf8")),
);

test("lane row screen height scales with zoom", () => {
  const { swimlaneRows } = computeLayout(apex);
  const row = swimlaneRows[0]!;
  const atHalf = laneRowScreenRect(row, { x: 0, y: 0, zoom: 0.5 });
  assert.equal(atHalf.height, LANE_ROW_HEIGHT * 0.5);
  const atOne = laneRowScreenRect(row, { x: 0, y: 100, zoom: 1 });
  assert.equal(atOne.top, row.y + 100);
  assert.equal(atOne.height, LANE_ROW_HEIGHT);
});

test("band gaps sit between bands in flow space", () => {
  const { swimlaneRows } = computeLayout(apex);
  const gaps = bandGapsFromRows(swimlaneRows);
  assert.ok(gaps.length >= 2);
  const cvGap = gaps.find((g) => g.band === "commandView");
  assert.ok(cvGap);
  assert.equal(cvGap.yEnd - cvGap.yStart, BAND_GAP);
});

test("all lane rows screen tops follow viewport pan", () => {
  const { swimlaneRows } = computeLayout(apex);
  const vp = { x: 10, y: -40, zoom: 0.8 };
  const screens = allLaneRowsScreen(swimlaneRows, vp);
  assert.equal(screens[0]!.top, swimlaneRows[0]!.y * vp.zoom + vp.y);
  assert.equal(flowLenToScreen(LANE_ROW_HEIGHT, vp), LANE_ROW_HEIGHT * vp.zoom);
});
