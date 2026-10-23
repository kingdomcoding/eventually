import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { BlueprintDocumentSchema } from "../src/document.js";
import { computeLayout } from "./layout.js";
import { swimlaneStoryViewport } from "./swimlaneStoryCamera.js";

const here = dirname(fileURLToPath(import.meta.url));
const apex = BlueprintDocumentSchema.parse(
  JSON.parse(readFileSync(join(here, "../samples/apex-bee.json"), "utf8")),
);

test("swimlane story viewport uses event band height for zoom", () => {
  const layout = computeLayout(apex, "swimlane");
  const vp = swimlaneStoryViewport(layout, apex, 1200, 720, 0.12, 0.3, 1.5);
  assert.ok(vp.zoom >= 0.55, `expected readable zoom, got ${vp.zoom}`);
  assert.ok(vp.zoom <= 1.2);
  assert.ok(vp.y < 0, "anchors band top below viewport padding");
});
