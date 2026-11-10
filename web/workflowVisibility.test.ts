import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { BlueprintDocumentSchema } from "../src/document.js";
import { computeTimelineRange, computeWorkflowPath } from "./workflowPath.js";
import { defaultSessionState, reduceSession } from "./sessionState.js";
import { nodeDisplayTier } from "./viewMode.js";

const here = dirname(fileURLToPath(import.meta.url));
const apex = BlueprintDocumentSchema.parse(
  JSON.parse(readFileSync(join(here, "../samples/apex-bee.json"), "utf8")),
);

test("stream click marks events and timeline remembers that set", () => {
  const stream = reduceSession(
    { ...defaultSessionState(), hydrated: true },
    { type: "SET_DIAGRAM_MODE", mode: "stream" },
  );
  const marked = reduceSession(stream.state, { type: "EVENT_CLICK", eventId: "evt-device-registered" });
  assert.deepEqual(marked.state.board.openEventIds, ["evt-device-registered"]);
  assert.equal(marked.state.board.focusAnchorId, null);
  assert.equal(marked.camera.type, "Preserve");

  const again = reduceSession(marked.state, { type: "EVENT_CLICK", eventId: "evt-exam-submitted" });
  assert.deepEqual(again.state.board.openEventIds, ["evt-device-registered", "evt-exam-submitted"]);

  const timeline = reduceSession(again.state, {
    type: "SET_DIAGRAM_MODE",
    mode: "timeline",
    workflowFromEventId: "evt-device-registered",
    workflowToEventId: "evt-exam-submitted",
  });
  assert.equal(timeline.state.board.diagramMode, "timeline");
  assert.deepEqual(timeline.state.board.openEventIds, ["evt-device-registered", "evt-exam-submitted"]);
  assert.equal(timeline.state.board.workflowFromEventId, "evt-device-registered");
  assert.equal(timeline.state.board.focusAnchorId, null);
});

test("stream selection does not expand commands or related events", () => {
  const state = {
    diagramMode: "stream" as const,
    showAll: false,
    focusAnchorId: "evt-device-registered",
    openEventIds: new Set(["evt-device-registered", "evt-exam-submitted"]),
    hoverExpandedId: null,
    workflowPath: { status: "inactive" as const },
  };

  assert.equal(nodeDisplayTier(apex, "evt-device-registered", state, "idle"), "full");
  assert.equal(nodeDisplayTier(apex, "evt-exam-submitted", state, "idle"), "full");
  assert.equal(nodeDisplayTier(apex, "evt-trial-started", state, "idle"), "context");
  assert.equal(nodeDisplayTier(apex, "cmd-register-device", state, "idle"), "hidden");
  assert.equal(nodeDisplayTier(apex, "cmd-submit-exam", state, "idle"), "hidden");
  assert.equal(nodeDisplayTier(apex, "data-table-devices", state, "idle"), "hidden");

  const hovered = { ...state, hoverExpandedId: "evt-device-registered" };
  assert.equal(nodeDisplayTier(apex, "cmd-register-device", hovered, "active"), "hidden");
  assert.equal(nodeDisplayTier(apex, "data-table-devices", hovered, "active"), "hidden");
});

test("timeline range dims events outside the slice", () => {
  const path = computeTimelineRange(apex, "evt-device-registered", "evt-device-revoked");
  assert.equal(path.status, "valid");
  if (path.status !== "valid") return;

  const state = {
    diagramMode: "timeline" as const,
    showAll: false,
    focusAnchorId: null,
    openEventIds: new Set<string>(),
    hoverExpandedId: null,
    workflowPath: path,
  };

  assert.equal(nodeDisplayTier(apex, "evt-device-registered", state, "idle"), "full");
  assert.equal(nodeDisplayTier(apex, "evt-device-revoked", state, "idle"), "full");
  assert.equal(nodeDisplayTier(apex, "evt-exam-submitted", state, "idle"), "context");
  assert.equal(nodeDisplayTier(apex, "cmd-register-device", state, "idle"), "full");
  assert.equal(nodeDisplayTier(apex, "cmd-submit-exam", state, "idle"), "context");
});

test("path events stay full while hovered", () => {
  const path = computeWorkflowPath(apex, "evt-payment-initiated", "evt-payment-confirmed");
  assert.equal(path.status, "valid");
  if (path.status !== "valid") return;

  const state = {
    diagramMode: "stream" as const,
    showAll: false,
    focusAnchorId: null,
    openEventIds: new Set<string>(),
    hoverExpandedId: "evt-payment-confirmed",
    workflowPath: path,
  };
  assert.equal(nodeDisplayTier(apex, "evt-payment-confirmed", state, "active"), "full");
  assert.equal(nodeDisplayTier(apex, "cmd-confirm-payment", state, "active"), "hidden");
});
