import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sample from "../samples/apex-bee.json";
import { BlueprintDocumentSchema } from "@schema/document.js";
import { computeLayout } from "./layout.js";
import { swimlaneStoryViewport } from "./swimlaneStoryCamera.js";

describe("swimlaneStoryViewport", () => {
  it("uses event band height for zoom, not full diagram width", () => {
    const doc = BlueprintDocumentSchema.parse(sample);
    const layout = computeLayout(doc, "swimlane");
    const vp = swimlaneStoryViewport(layout, doc, 1200, 720, 0.12, 0.3, 1.5);
    assert.ok(vp.zoom >= 0.45, `expected readable zoom, got ${vp.zoom}`);
    assert.ok(vp.zoom <= 1.2);
    assert.ok(vp.y < 0, "anchors band top below viewport padding");
  });
});
