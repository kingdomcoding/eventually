import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { BlueprintDocumentSchema } from "../src/document.js";
import { computeWorkflowPath } from "./workflowPath.js";
import { nodeDisplayTier } from "./viewMode.js";

const here = dirname(fileURLToPath(import.meta.url));
const apex = BlueprintDocumentSchema.parse(
  JSON.parse(readFileSync(join(here, "../samples/apex-bee.json"), "utf8")),
);

test("off-path events stay hidden until POI", () => {
  const path = computeWorkflowPath(apex, "evt-payment-initiated", "evt-payment-confirmed");
  assert.equal(path.status, "valid");
  if (path.status !== "valid") return;

  const state = {
    diagramMode: "swimlane" as const,
    showAll: false,
    focusAnchorId: null,
    openEventIds: new Set<string>(),
    hoverExpandedId: null,
    workflowPath: path,
  };

  assert.equal(nodeDisplayTier(apex, "evt-trial-started", state, "idle"), "context"); // different stream
  assert.equal(nodeDisplayTier(apex, "evt-payment-confirmed", state, "idle"), "full");

  const withHover = {
    ...state,
    hoverExpandedId: "evt-payment-confirmed",
  };
  assert.equal(nodeDisplayTier(apex, "evt-trial-started", withHover, "idle"), "context");
});

test("path events stay full while hovered", () => {
  const path = computeWorkflowPath(apex, "evt-payment-initiated", "evt-payment-confirmed");
  assert.equal(path.status, "valid");
  if (path.status !== "valid") return;

  const state = {
    diagramMode: "swimlane" as const,
    showAll: false,
    focusAnchorId: null,
    openEventIds: new Set<string>(),
    hoverExpandedId: "evt-payment-confirmed",
    workflowPath: path,
  };
  assert.equal(nodeDisplayTier(apex, "evt-payment-confirmed", state, "active"), "full");
});
