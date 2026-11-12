import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { BlueprintDocumentSchema } from "../src/document.js";
import {
  computeTimelineRange,
  computeWorkflowPath,
  listWorkflowEventOptions,
  timelineSelectionPath,
} from "./workflowPath.js";

const here = dirname(fileURLToPath(import.meta.url));
const apex = BlueprintDocumentSchema.parse(
  JSON.parse(readFileSync(join(here, "../samples/apex-bee.json"), "utf8")),
);

test("inactive when either endpoint missing", () => {
  assert.deepEqual(computeWorkflowPath(apex, null, null), { status: "inactive" });
  assert.equal(computeWorkflowPath(apex, "evt-device-registered", null).status, "invalid");
});

test("valid chain on subscription stream", () => {
  const r = computeWorkflowPath(apex, "evt-trial-started", "evt-subscription-cancelled");
  assert.equal(r.status, "valid");
  if (r.status !== "valid") return;
  // Trial → Activated → Updated → Cancelled (license purchase lives on Licensing).
  assert.equal(r.eventIds.size, 4);
  assert.equal(r.edgeIds.size, 3);
});

test("subscription entries are not chained to each other", () => {
  const r = computeWorkflowPath(apex, "evt-entitlement-imported", "evt-trial-started");
  assert.equal(r.status, "invalid");
});

test("interview spine from started to scored", () => {
  const r = computeWorkflowPath(apex, "evt-interview-started", "evt-interview-scored");
  assert.equal(r.status, "valid");
  if (r.status !== "valid") return;
  assert.equal(r.eventIds.size, 2);
  assert.ok(r.edgeIds.has("then-interview-started-scored"));
});

test("study group linear chain", () => {
  const r = computeWorkflowPath(apex, "evt-group-created", "evt-group-settings-updated");
  assert.equal(r.status, "valid");
  if (r.status !== "valid") return;
  assert.equal(r.eventIds.size, 5);
  assert.equal(r.edgeIds.size, 4);
});

test("cross-stream workflow is invalid", () => {
  const r = computeWorkflowPath(apex, "evt-device-registered", "evt-trial-started");
  assert.equal(r.status, "invalid");
});

test("single-event workflow", () => {
  const r = computeWorkflowPath(apex, "evt-trial-started", "evt-trial-started");
  assert.equal(r.status, "valid");
  if (r.status !== "valid") return;
  assert.deepEqual([...r.eventIds], ["evt-trial-started"]);
});

test("invalid when end not reachable from start on same stream", () => {
  const r = computeWorkflowPath(apex, "evt-device-revoked", "evt-device-imported");
  assert.equal(r.status, "invalid");
  if (r.status !== "invalid") return;
  assert.equal(r.code, "not_connected");
});

test("workflow labels include stream name", () => {
  const opts = listWorkflowEventOptions(apex);
  assert.equal(opts.length, 38); // includes Licensing context events and User Registered
  assert.ok(opts.some((o) => o.label.includes("Subscription") && o.name === "Trial Started V1"));
  assert.ok(opts.some((o) => o.label.includes("User") && o.name === "User Registered"));
});

test("diamond union includes both branches", () => {
  const doc = BlueprintDocumentSchema.parse({
    schemaVersion: 1,
    meta: { id: "diamond", name: "Diamond", version: 1, modelVersion: 1 },
    streams: [{ id: "ev", name: "Timeline", band: "events", order: 0 }],
    nodes: [
      { id: "a", type: "event", name: "A", streamId: "ev", timelineIndex: 0, payload: [] },
      { id: "b", type: "event", name: "B", streamId: "ev", timelineIndex: 1, payload: [] },
      { id: "c", type: "event", name: "C", streamId: "ev", timelineIndex: 2, payload: [] },
      { id: "d", type: "event", name: "D", streamId: "ev", timelineIndex: 3, payload: [] },
      { id: "e", type: "event", name: "E", streamId: "ev", timelineIndex: 4, payload: [] },
    ],
    edges: [
      { id: "t-ab", from: "a", to: "b", rel: "ordersBefore" },
      { id: "t-ac", from: "a", to: "c", rel: "ordersBefore" },
      { id: "t-bd", from: "b", to: "d", rel: "ordersBefore" },
      { id: "t-cd", from: "c", to: "d", rel: "ordersBefore" },
      { id: "t-de", from: "d", to: "e", rel: "ordersBefore" },
    ],
  });
  const r = computeWorkflowPath(doc, "a", "e");
  assert.equal(r.status, "valid");
  if (r.status !== "valid") return;
  assert.deepEqual([...r.eventIds].sort(), ["a", "b", "c", "d", "e"]);
  assert.equal(r.edgeIds.size, 5);
});

test("timeline selection keeps only the marked events", () => {
  const path = timelineSelectionPath(apex, ["evt-device-registered", "evt-trial-started"]);
  assert.equal(path.status, "valid");
  if (path.status !== "valid") return;
  assert.equal(path.fromEventId, "evt-device-registered");
  assert.equal(path.toEventId, "evt-trial-started");
  assert.equal(path.eventIds.has("evt-device-registered"), true);
  assert.equal(path.eventIds.has("evt-trial-started"), true);
  assert.equal(path.eventIds.has("evt-device-revoked"), false);
  assert.equal(path.neighborIds.has("cmd-register-device"), true);
});

test("timeline path keeps external Paystack Checkout Page at full neighbor emphasis", () => {
  const range = computeTimelineRange(
    apex,
    "evt-single-charge-initiated",
    "evt-charge-succeeded",
  );
  assert.equal(range.status, "valid");
  if (range.status !== "valid") return;
  assert.equal(range.neighborIds.has("scr-payment-page"), true);
  assert.equal(
    range.neighborIds.has("trg-paystack-checkout"),
    true,
    "edgeless external checkout must share slice emphasis with payment page",
  );
  assert.equal(range.neighborIds.has("scr-transaction-status"), true);
});

test("timeline range is the narrative slice from start through end", () => {
  const range = computeTimelineRange(apex, "evt-device-registered", "evt-trial-started");
  assert.equal(range.status, "valid");
  if (range.status !== "valid") return;
  assert.deepEqual([...range.eventIds], [
    "evt-device-registered",
    "evt-device-revoked",
    "evt-entitlement-imported",
    "evt-trial-started",
  ]);
  assert.equal(computeTimelineRange(apex, "evt-trial-started", "evt-device-registered").status, "invalid");
});
