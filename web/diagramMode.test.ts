import assert from "node:assert/strict";
import test from "node:test";

import { DIAGRAM_MODE_ORDER, nextDiagramMode, normalizeDiagramMode } from "./diagramMode.js";

test("diagram mode order cycles design → swimlane → timeline", () => {
  assert.deepEqual([...DIAGRAM_MODE_ORDER], ["design", "swimlane", "timeline"]);
  assert.equal(nextDiagramMode("design"), "swimlane");
  assert.equal(nextDiagramMode("swimlane"), "timeline");
  assert.equal(nextDiagramMode("timeline"), "design");
});

test("normalizeDiagramMode defaults to design", () => {
  assert.equal(normalizeDiagramMode(undefined), "design");
  assert.equal(normalizeDiagramMode("stream"), "swimlane");
});
