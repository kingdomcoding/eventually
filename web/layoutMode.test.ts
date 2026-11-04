import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { BlueprintDocumentSchema } from "../src/document.js";
import { buildEdges } from "./edges.js";
import { computeLayout } from "./layout.js";
import { NODE_H } from "./layoutMetrics.js";
import { formatParentsLabel } from "./StickyNode.js";

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
  assert.equal(layout.streamRows.filter((r) => r.band === "events").length, 1);
});

test("timeline mode collapses user categories into one Triggers row", () => {
  const layout = computeLayout(apex, "timeline");
  const uiRows = layout.streamRows.filter((r) => r.band === "ui");
  assert.equal(uiRows.length, 1);
  assert.equal(uiRows[0]!.name, "Triggers");
  const screens = apex.nodes.filter((n) => n.type === "screen");
  const screenYs = screens.map((s) => layout.positions.get(s.id)!.y);
  assert.equal(new Set(screenYs).size, 1);
});

test("timeline layout keeps every event when a range is selected", () => {
  const layout = computeLayout(apex, "timeline");
  assert.equal(layout.positions.has("evt-device-registered"), true);
  assert.equal(layout.positions.has("evt-device-revoked"), true);
  assert.equal(layout.positions.has("evt-exam-submitted"), true);
  assert.equal(layout.positions.has("cmd-register-device"), true);
  assert.equal(layout.positions.has("cmd-submit-exam"), true);
});

test("timeline gutter rows use main labels only", () => {
  const layout = computeLayout(apex, "timeline");
  assert.equal(layout.streamRows.find((r) => r.band === "ui")?.name, "Triggers");
  assert.equal(layout.streamRows.find((r) => r.band === "commandView")?.name, "Commands · Views");
  assert.equal(layout.streamRows.find((r) => r.band === "events")?.name, "Events");
  assert.equal(layout.streamRows.length, 3);
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

test("design mode lays out only user-category rows and screens", () => {
  const layout = computeLayout(apex, "design");
  assert.equal(layout.streamRows.every((r) => r.band === "ui"), true);
  assert.ok(layout.streamRows.length >= 7);
  const screens = apex.nodes.filter((n) => n.type === "screen");
  for (const s of screens) {
    assert.ok(layout.positions.has(s.id), `${s.id} missing in design layout`);
  }
  const evt = apex.nodes.find((n) => n.type === "event");
  assert.ok(evt);
  assert.equal(layout.positions.has(evt.id), false);
});

test("stream mode keeps separate event streams", () => {
  const layout = computeLayout(apex, "stream");
  assert.ok(layout.streamRows.filter((r) => r.band === "events").length >= 4);
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
  assert.equal(apex.meta.modelVersion, 10);
  assert.ok(apex.nodes.some((n) => n.type === "view"));
  assert.ok(apex.nodes.some((n) => n.type === "automation"));
  assert.ok(apex.nodes.some((n) => n.type === "command"));
  assert.ok(apex.nodes.some((n) => n.type === "screen"));
  assert.ok(layout.positions.has("cmd-register-device"));
  assert.ok(layout.positions.has("scr-auth-google"));
  assert.ok(layout.positions.has("cmd-submit-exam"));
  const evtY = layout.positions.get("evt-device-registered")!.y;
  const cmdY = layout.positions.get("cmd-register-device")!.y;
  assert.notEqual(evtY, cmdY);
});

test("apex timeline places external Paystack checkout with the payment page column", () => {
  const layout = computeLayout(apex, "timeline");
  const checkout = layout.positions.get("trg-paystack-checkout");
  const payment = layout.positions.get("scr-payment-page");
  const success = layout.positions.get("trg-success-page");
  const payButton = layout.positions.get("trg-pay-with-paystack");
  assert.ok(checkout, "Paystack checkout missing from timeline layout");
  assert.ok(payment);
  assert.ok(success);
  assert.ok(payButton);
  // Must not park at the left spine (story index 0) — same neighborhood as payment page.
  assert.ok(checkout.x > payButton.x, "checkout should be after Pay with Paystack");
  assert.ok(Math.abs(checkout.x - payment.x) < 400, "checkout should sit near payment page");
  assert.equal(checkout.y, payment.y);
  const external = apex.nodes.find((n) => n.id === "trg-paystack-checkout");
  assert.ok(external?.type === "trigger" && external.external === true);
  assert.equal(external.name, "Paystack Checkout Page");
  assert.equal(
    apex.nodes.find((n) => n.id === "trg-success-page")?.name,
    "Paystack Payment Success Page",
  );
  assert.equal(
    apex.nodes.find((n) => n.id === "evt-customer-redirected-to-success")?.name,
    "Customer Redirected To Success Page",
  );
  assert.equal(
    apex.nodes.find((n) => n.id === "cmd-redirect-to-success-page")?.name,
    "Mark Customer Visit to Success Page",
  );
  const payTrigger = apex.nodes.find((n) => n.id === "trg-pay-with-paystack");
  assert.ok(payTrigger?.type === "trigger");
  assert.deepEqual(payTrigger.parents, ["Purchase License Page"]);
  const redirect = apex.edges.find(
    (e) =>
      e.rel === "redirectsTo" &&
      e.from === "scr-payment-page" &&
      e.to === "trg-paystack-checkout",
  );
  assert.ok(redirect, "Purchase License Page should redirect to Paystack Checkout Page");
  const successRedirect = apex.edges.find(
    (e) =>
      e.rel === "redirectsTo" &&
      e.from === "trg-paystack-checkout" &&
      e.to === "trg-success-page",
  );
  assert.ok(successRedirect, "Paystack Checkout Page should redirect to Paystack Payment Success Page");
  for (const edge of [redirect, successRedirect]) {
    const flowRedirect = buildEdges(apex, layout.positions).find((e) => e.id === edge!.id);
    assert.ok(flowRedirect);
    assert.equal(flowRedirect.type, "smoothstep");
    assert.equal(flowRedirect.sourceHandle, "t-out");
    assert.equal(flowRedirect.targetHandle, "t-in");
    assert.equal(flowRedirect.label, "redirect");
    assert.match(String(flowRedirect.style?.strokeDasharray ?? ""), /5/);
  }
});

test("formatParentsLabel uses singular Parent and comma-separates many", () => {
  assert.equal(formatParentsLabel([]), null);
  assert.equal(formatParentsLabel(["Purchase License Page"]), "Parent: Purchase License Page");
  assert.equal(
    formatParentsLabel(["Purchase License Page", "Paystack Payment Success Page"]),
    "Parents: Purchase License Page, Paystack Payment Success Page",
  );
});
