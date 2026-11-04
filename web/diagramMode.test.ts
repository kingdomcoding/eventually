import assert from "node:assert/strict";
import test from "node:test";

import { DIAGRAM_MODE_ORDER, nextDiagramMode, normalizeDiagramMode } from "./diagramMode.js";

test("diagram mode order cycles design → stream → timeline", () => {
  assert.deepEqual([...DIAGRAM_MODE_ORDER], ["design", "stream", "timeline"]);
  assert.equal(nextDiagramMode("design"), "stream");
  assert.equal(nextDiagramMode("stream"), "timeline");
  assert.equal(nextDiagramMode("timeline"), "design");
});

test("normalizeDiagramMode defaults to design", () => {
  assert.equal(normalizeDiagramMode(undefined), "design");
  assert.equal(normalizeDiagramMode("stream"), "stream");
  assert.equal(normalizeDiagramMode("swimlane"), "stream");
});
