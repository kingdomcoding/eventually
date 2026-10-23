import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { BlueprintDocumentSchema } from "../src/document.js";
import { computeLayout } from "./layout.js";
import { NODE_H } from "./layoutMetrics.js";

const here = dirname(fileURLToPath(import.meta.url));
const apex = BlueprintDocumentSchema.parse(
  JSON.parse(readFileSync(join(here, "../samples/apex-bee.json"), "utf8")),
);
const hotel = BlueprintDocumentSchema.parse(
  JSON.parse(readFileSync(join(here, "../samples/minimal-hotel.json"), "utf8")),
);

test("timeline mode places all events on one horizontal row", () => {
  const layout = computeLayout(apex, "timeline");
  const events = apex.nodes.filter((n) => n.type === "event");
  const ys = events.map((e) => layout.positions.get(e.id)!.y);
  assert.equal(new Set(ys).size, 1);
  assert.equal(layout.swimlaneRows.filter((r) => r.band === "events").length, 1);
});

test("timeline mode orders events by narrativeOrder", () => {
  const layout = computeLayout(apex, "timeline");
  const order = apex.meta.narrativeOrder!;
  let prevX = -Infinity;
  for (const id of order) {
    const x = layout.positions.get(id)!.x;
    assert.ok(x > prevX, `${id} should be to the right of prior spine events`);
    prevX = x;
  }
});

test("swimlane mode keeps separate event swimlanes", () => {
  const layout = computeLayout(apex, "swimlane");
  assert.ok(layout.swimlaneRows.filter((r) => r.band === "events").length >= 4);
});

test("hotel timeline lays out command and view with events", () => {
  const layout = computeLayout(hotel, "timeline");
  assert.ok(layout.positions.has("cmd-book-room"));
  assert.ok(layout.positions.has("view-availability"));
  const evtY = layout.positions.get("evt-room-booked")!.y;
  const cmdY = layout.positions.get("cmd-book-room")!.y;
  assert.notEqual(evtY, cmdY);
  assert.ok(Math.abs(evtY - cmdY) > NODE_H);
});

test("apex timeline includes commands and screens from enriched model", () => {
  const layout = computeLayout(apex, "timeline");
  assert.equal(apex.meta.modelVersion, 4);
  assert.ok(apex.nodes.some((n) => n.type === "command"));
  assert.ok(apex.nodes.some((n) => n.type === "screen"));
  assert.ok(layout.positions.has("cmd-register-device"));
  assert.ok(layout.positions.has("scr-auth-google"));
  assert.ok(layout.positions.has("cmd-submit-exam"));
  const evtY = layout.positions.get("evt-device-registered")!.y;
  const cmdY = layout.positions.get("cmd-register-device")!.y;
  assert.notEqual(evtY, cmdY);
});
