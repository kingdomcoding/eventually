import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { BlueprintDocumentSchema } from "../src/document.js";
import { Position } from "@xyflow/react";
import { buildEdges, VERTICAL_ENTRY_EDGE_TYPE } from "./edges.js";
import { computeLayout } from "./layout.js";
import { NODE_H } from "./layoutMetrics.js";
import {
  dataTableWhoStreamId,
  formatDataTableLaneLabel,
  formatLaneLabel,
} from "./laneLabel.js";
import {
  formatKindLabel,
  formatParentsLabel,
  formatStickyKindLabel,
  formatUiCategoryLabel,
  resolveUiKindIconKey,
  UI_KIND_LUCIDE_ICONS,
} from "./StickyNode.js";
import { getRedirectClearPath, getVerticalEntryPath } from "./VerticalEntryEdge.js";

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
  assert.equal(layout.streamRows.find((r) => r.band === "commandView")?.name, "Commands · Data Tables");
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

test("hotel timeline lays out command and data table with events", () => {
  const layout = computeLayout(hotel, "timeline");
  assert.ok(layout.positions.has("cmd-book-room"));
  assert.ok(layout.positions.has("data-table-availability"));
  const evtY = layout.positions.get("evt-room-booked")!.y;
  const cmdY = layout.positions.get("cmd-book-room")!.y;
  assert.notEqual(evtY, cmdY);
  assert.ok(Math.abs(evtY - cmdY) > NODE_H);
});

test("apex timeline includes commands and screens from enriched model", () => {
  const layout = computeLayout(apex, "timeline");
  assert.equal(apex.meta.modelVersion, 10);
  assert.ok(apex.nodes.some((n) => n.type === "dataTable"));
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
  const statusPage = layout.positions.get("scr-transaction-status");
  const successAutoRedirectPos = layout.positions.get("trg-auto-redirect-success");
  const failureAutoRedirectPos = layout.positions.get("trg-auto-redirect-failure");
  const payButton = layout.positions.get("trg-license-checkout-modal");
  assert.ok(checkout, "Paystack checkout missing from timeline layout");
  assert.ok(payment);
  assert.ok(statusPage);
  assert.ok(successAutoRedirectPos);
  assert.ok(failureAutoRedirectPos);
  assert.ok(payButton);
  // Must not park at the left spine (story index 0) — same neighborhood as payment page.
  assert.ok(checkout.x > payButton.x, "checkout should be after License Checkout Modal");
  assert.ok(Math.abs(checkout.x - payment.x) < 400, "checkout should sit near payment page");
  assert.equal(checkout.y, payment.y);
  // Payment → checkout → success auto-redirect → failure auto-redirect → transaction status
  assert.ok(payment.x < checkout.x, "checkout fills left after payment (status no longer ahead)");
  assert.ok(checkout.x < successAutoRedirectPos.x);
  assert.ok(successAutoRedirectPos.x < failureAutoRedirectPos.x);
  assert.ok(
    failureAutoRedirectPos.x < statusPage.x,
    "Transaction Status Page should sit after Failure Auto-Redirect URL",
  );
  assert.equal(statusPage.y, failureAutoRedirectPos.y);
  const external = apex.nodes.find((n) => n.id === "trg-paystack-checkout");
  assert.ok(external?.type === "trigger" && external.external === true);
  assert.equal(external.name, "Paystack Checkout Page");
  assert.equal(
    apex.nodes.find((n) => n.id === "scr-transaction-status")?.name,
    "Transaction Status Page",
  );
  assert.equal(apex.nodes.find((n) => n.id === "trg-success-page"), undefined);
  assert.equal(apex.nodes.find((n) => n.id === "trg-cancel-page"), undefined);
  assert.equal(
    apex.nodes.find((n) => n.id === "evt-customer-redirected-to-success")?.name,
    "Customer Redirected From Checkout Page To Success URL",
  );
  assert.equal(
    apex.nodes.find((n) => n.id === "evt-customer-redirected-to-cancel")?.name,
    "Customer Redirected From Checkout Page To Cancel URL",
  );
  assert.equal(apex.nodes.find((n) => n.id === "cmd-record-customer-redirect"), undefined);
  const successAutoRedirect = apex.nodes.find((n) => n.id === "trg-auto-redirect-success");
  const failureAutoRedirect = apex.nodes.find((n) => n.id === "trg-auto-redirect-failure");
  assert.ok(successAutoRedirect?.type === "trigger" && successAutoRedirect.autoRedirect === true);
  assert.ok(failureAutoRedirect?.type === "trigger" && failureAutoRedirect.autoRedirect === true);
  assert.equal(successAutoRedirect.name, "Success Auto-Redirect URL");
  assert.equal(failureAutoRedirect.name, "Failure Auto-Redirect URL");
  assert.equal(
    formatUiCategoryLabel({
      kind: "trigger",
      name: successAutoRedirect.name,
      autoRedirect: true,
    }),
    "Auto-Redirect URL",
  );
  const successRedirectCmd = apex.nodes.find((n) => n.id === "cmd-record-customer-redirect-success");
  const failureRedirectCmd = apex.nodes.find((n) => n.id === "cmd-record-customer-redirect-failure");
  assert.ok(successRedirectCmd?.type === "command");
  assert.ok(failureRedirectCmd?.type === "command");
  assert.equal(
    successRedirectCmd.name,
    "Record Customer Redirect From Checkout Page To Success URL",
  );
  assert.equal(
    failureRedirectCmd.name,
    "Record Customer Redirect From Checkout Page To Cancel URL",
  );
  assert.deepEqual(successRedirectCmd.produces, ["evt-customer-redirected-to-success"]);
  assert.deepEqual(failureRedirectCmd.produces, ["evt-customer-redirected-to-cancel"]);
  assert.deepEqual(
    apex.edges
      .filter((e) => e.rel === "issues" && e.from === "scr-transaction-status")
      .map((e) => e.to),
    [],
    "Transaction Status Page stands alone and issues no command",
  );
  assert.ok(
    apex.edges.some(
      (e) =>
        e.rel === "issues" &&
        e.from === "trg-auto-redirect-success" &&
        e.to === "cmd-record-customer-redirect-success",
    ),
  );
  assert.ok(
    apex.edges.some(
      (e) =>
        e.rel === "issues" &&
        e.from === "trg-auto-redirect-failure" &&
        e.to === "cmd-record-customer-redirect-failure",
    ),
  );
  const payTrigger = apex.nodes.find((n) => n.id === "trg-license-checkout-modal");
  assert.ok(payTrigger?.type === "trigger");
  assert.deepEqual(payTrigger.parents, ["License Purchase Page"]);
  assert.deepEqual(
    payTrigger.fields?.map((f) => f.name),
    ["cohort_window_id", "name", "price"],
  );
  const initiateLicense = apex.nodes.find((n) => n.id === "cmd-initiate-license-purchase");
  assert.ok(initiateLicense?.type === "command");
  assert.equal(initiateLicense.name, "Initiate License Purchase");
  assert.deepEqual(initiateLicense.produces, ["evt-license-purchase-initiated"]);
  assert.deepEqual(
    initiateLicense.fields?.map((f) => f.name),
    ["user_id", "cohort_window_id"],
  );
  assert.deepEqual(
    initiateLicense.input.map((f) => f.name),
    ["user_id", "cohort_window_id"],
  );
  const licenseInitiated = apex.nodes.find((n) => n.id === "evt-license-purchase-initiated");
  assert.ok(licenseInitiated?.type === "event");
  assert.equal(licenseInitiated.name, "License Purchase Initiated");
  assert.equal(licenseInitiated.streamId, "stream-licensing");
  assert.deepEqual(
    licenseInitiated.fields?.map((f) => f.name),
    ["user_id", "cohort_window_id"],
  );
  const licenseIssued = apex.nodes.find((n) => n.id === "evt-license-issued");
  assert.ok(licenseIssued?.type === "event");
  assert.equal(licenseIssued.name, "License Issued");
  assert.equal(licenseIssued.streamId, "stream-licensing");
  assert.equal(
    apex.edges.some((e) => e.from === "evt-license-issued" || e.to === "evt-license-issued"),
    false,
    "License Issued is standalone — not wired yet",
  );
  const licensingStream = apex.streams.find((s) => s.id === "stream-licensing");
  assert.ok(licensingStream);
  assert.equal(licensingStream.name, "Licensing");
  const initiatedLicenseTable = apex.nodes.find(
    (n) => n.id === "data-table-initiated-license-purchases",
  );
  assert.ok(initiatedLicenseTable?.type === "dataTable");
  assert.equal(initiatedLicenseTable.name, "Initiated License Purchases");
  assert.deepEqual(initiatedLicenseTable.fedBy, ["evt-license-purchase-initiated"]);
  const openCohortWindows = apex.nodes.find((n) => n.id === "data-table-open-cohort-windows");
  assert.ok(openCohortWindows?.type === "dataTable");
  assert.equal(openCohortWindows.name, "Open Cohort Windows");
  assert.equal(openCohortWindows.sliceId, "slice-available-license-cards");
  assert.deepEqual(openCohortWindows.fedBy, ["evt-cohort-window-opened"]);
  assert.deepEqual(
    openCohortWindows.fields.map((f) => f.name),
    ["cohort_window_id", "name", "price"],
  );
  assert.equal(
    openCohortWindows.fields.some((f) => f.name === "program_id"),
    false,
    "Open Cohort Windows must not include program_id",
  );
  const availableLicenseCards = apex.nodes.find((n) => n.id === "trg-available-license-cards");
  assert.ok(availableLicenseCards?.type === "trigger");
  assert.equal(availableLicenseCards.name, "Available License Cards");
  assert.equal(availableLicenseCards.sliceId, "slice-available-license-cards");
  assert.deepEqual(availableLicenseCards.parents, ["License Purchase Page"]);
  assert.deepEqual(
    availableLicenseCards.fields?.map((f) => f.name),
    ["cohort_window_id", "name", "price"],
  );
  assert.notEqual(
    availableLicenseCards.sliceId,
    apex.nodes.find((n) => n.id === "trg-license-checkout-modal")?.sliceId,
    "Available License Cards is a different slice from License Checkout Modal",
  );
  assert.equal(apex.nodes.find((n) => n.id === "trg-available-licenses"), undefined);
  assert.equal(apex.nodes.find((n) => n.id === "trg-pay-with-paystack"), undefined);
  assert.equal(apex.nodes.find((n) => n.id === "trg-license-checkout-page"), undefined);
  
  const cohortOpened = apex.nodes.find((n) => n.id === "evt-cohort-window-opened");
  assert.ok(cohortOpened?.type === "event");
  assert.equal(cohortOpened.name, "Cohort Window Opened");
  assert.deepEqual(
    cohortOpened.fields?.map((f) => f.name),
    ["cohort_window_id", "program_id", "name", "price"],
  );
  assert.ok(
    cohortOpened.fields?.some((f) => f.name === "price"),
    "Cohort Window Opened event still keeps price",
  );
  assert.equal(cohortOpened.fields?.find((f) => f.name === "price")?.type, "integer");
  assert.match(
    String(cohortOpened.fields?.find((f) => f.name === "price")?.description),
    /cobalt/i,
  );
  assert.equal(cohortOpened.fields?.find((f) => f.name === "cohort_window_id")?.type, "uuid");
  assert.equal(cohortOpened.fields?.find((f) => f.name === "program_id")?.type, "uuid");
  const cohortClosed = apex.nodes.find((n) => n.id === "evt-cohort-window-closed");
  assert.ok(cohortClosed?.type === "event");
  assert.equal(cohortClosed.name, "Cohort Window Closed");
  assert.deepEqual(
    cohortClosed.fields?.map((f) => f.name),
    ["cohort_window_id"],
  );
  assert.equal(cohortClosed.fields?.[0]?.type, "uuid");
  assert.equal(
    (apex.meta.narrativeOrder ?? []).at(-1),
    "evt-cohort-window-closed",
    "Cohort Window Closed should be the last narrative event",
  );
  assert.ok(
    apex.edges.some(
      (e) =>
        e.rel === "rendersOn" &&
        e.from === "data-table-open-cohort-windows" &&
        e.to === "trg-available-license-cards",
    ),
    "Open Cohort Windows should feed Available License Cards",
  );
  assert.ok(
    apex.edges.some(
      (e) =>
        e.rel === "rendersOn" &&
        e.from === "data-table-open-cohort-windows" &&
        e.to === "trg-license-checkout-modal",
    ),
    "Open Cohort Windows should feed License Checkout Modal",
  );
  assert.equal(
    formatDataTableLaneLabel(apex, "data-table-open-cohort-windows"),
    "For: License Purchase Page",
    "Open Cohort Windows Context is the License Purchase Page, not an element on it",
  );
  assert.equal(
    apex.edges.some(
      (e) =>
        e.rel === "issues" &&
        e.from === "trg-available-license-cards" &&
        e.to === "cmd-initiate-license-purchase",
    ),
    false,
    "Available License Cards must not issue Initiate License Purchase",
  );
  const openCohortWindowsPos = layout.positions.get("data-table-open-cohort-windows");
  const availableLicenseCardsPos = layout.positions.get("trg-available-license-cards");
  const initiateLicensePosForCatalog = layout.positions.get("cmd-initiate-license-purchase");
  const licenseCheckoutModalPos = layout.positions.get("trg-license-checkout-modal");
  assert.ok(
    openCohortWindowsPos && availableLicenseCardsPos && initiateLicensePosForCatalog && licenseCheckoutModalPos,
  );
  assert.equal(
    availableLicenseCardsPos.x,
    openCohortWindowsPos.x,
    "Available License Cards and Open Cohort Windows should share a column (vertical stack)",
  );
  assert.ok(
    availableLicenseCardsPos.y < openCohortWindowsPos.y,
    "Available License Cards (UI) should sit above Open Cohort Windows (data table)",
  );
  assert.ok(
    openCohortWindowsPos.x < initiateLicensePosForCatalog.x,
    "Open Cohort Windows slice should sit left of Initiate License Purchase",
  );
  assert.ok(
    availableLicenseCardsPos.x < licenseCheckoutModalPos.x,
    "Available License Cards should sit left of License Checkout Modal",
  );
  const subChargeAuto = apex.nodes.find((n) => n.id === "auto-subscription-charge");
  assert.ok(subChargeAuto?.type === "automation");
  assert.equal(subChargeAuto.name, "Trigger Paystack Payment");
  assert.equal(subChargeAuto.streamId, "lane-license-purchase-process-manager");
  assert.deepEqual(subChargeAuto.observes, ["data-table-initiated-license-purchases"]);
  const licensePurchaseManager = apex.streams.find((s) => s.id === "lane-license-purchase-process-manager");
  assert.ok(licensePurchaseManager);
  assert.equal(licensePurchaseManager.name, "License Purchase Process Manager");
  assert.ok(
    apex.edges.some(
      (e) =>
        e.rel === "issues" &&
        e.from === "trg-license-checkout-modal" &&
        e.to === "cmd-initiate-license-purchase",
    ),
    "License Checkout Modal should issue Initiate License Purchase",
  );
  assert.equal(
    apex.edges.some(
      (e) =>
        e.rel === "issues" &&
        e.from === "trg-license-checkout-modal" &&
        e.to === "cmd-initiate-single-charge",
    ),
    false,
  );
  assert.ok(
    apex.edges.some(
      (e) =>
        e.rel === "issues" &&
        e.from === "auto-subscription-charge" &&
        e.to === "cmd-initiate-single-charge",
    ),
    "Trigger Paystack Payment should issue Initiate Single Charge",
  );
  const observeEdge = apex.edges.find(
    (e) =>
      e.rel === "observes" &&
      e.from === "data-table-initiated-license-purchases" &&
      e.to === "auto-subscription-charge",
  );
  assert.ok(
    observeEdge,
    "Initiated License Purchases should connect into Trigger Paystack Payment",
  );
  const narrative = apex.meta.narrativeOrder ?? [];
  assert.equal(
    narrative.indexOf("evt-license-purchase-initiated") + 1,
    narrative.indexOf("evt-single-charge-initiated"),
    "License Purchase Initiated should sit immediately before Single Charge Initiated on the timeline spine",
  );
  const initiateLicensePos = layout.positions.get("cmd-initiate-license-purchase");
  const licenseInitiatedPos = layout.positions.get("evt-license-purchase-initiated");
  const initiatedLicensePos = layout.positions.get("data-table-initiated-license-purchases");
  const subChargePos = layout.positions.get("auto-subscription-charge");
  const singleChargePos = layout.positions.get("cmd-initiate-single-charge");
  assert.ok(
    initiateLicensePos && licenseInitiatedPos && initiatedLicensePos && subChargePos && singleChargePos,
  );
  assert.equal(initiateLicensePos.x, licenseInitiatedPos.x);
  assert.ok(initiateLicensePos.x < singleChargePos.x);
  assert.ok(initiatedLicensePos.x <= singleChargePos.x);
  assert.ok(Math.abs(subChargePos.x - singleChargePos.x) < 1);
  assert.ok(
    payButton.x <= initiateLicensePos.x && initiateLicensePos.x < singleChargePos.x,
    "License Checkout Modal → Initiate License Purchase column should precede Initiate Single Charge",
  );
  const redirect = apex.edges.find(
    (e) =>
      e.rel === "redirectsTo" &&
      e.from === "scr-payment-page" &&
      e.to === "trg-paystack-checkout",
  );
  assert.ok(redirect, "License Purchase Page should redirect to Paystack Checkout Page");
  const checkoutToSuccess = apex.edges.find(
    (e) =>
      e.rel === "redirectsTo" &&
      e.from === "trg-paystack-checkout" &&
      e.to === "trg-auto-redirect-success",
  );
  const checkoutToFailure = apex.edges.find(
    (e) =>
      e.rel === "redirectsTo" &&
      e.from === "trg-paystack-checkout" &&
      e.to === "trg-auto-redirect-failure",
  );
  assert.ok(checkoutToSuccess, "Paystack Checkout Page should redirect to Success Auto-Redirect URL");
  assert.ok(checkoutToFailure, "Paystack Checkout Page should redirect to Failure Auto-Redirect URL");
  const successToStatus = apex.edges.find(
    (e) =>
      e.rel === "redirectsTo" &&
      e.from === "trg-auto-redirect-success" &&
      e.to === "scr-transaction-status",
  );
  const failureToStatus = apex.edges.find(
    (e) =>
      e.rel === "redirectsTo" &&
      e.from === "trg-auto-redirect-failure" &&
      e.to === "scr-transaction-status",
  );
  assert.ok(successToStatus, "Success Auto-Redirect URL should redirect to Transaction Status Page");
  assert.ok(failureToStatus, "Failure Auto-Redirect URL should redirect to Transaction Status Page");
  assert.equal(
    apex.edges.filter(
      (e) =>
        e.rel === "redirectsTo" &&
        e.from === "trg-paystack-checkout" &&
        e.to === "scr-transaction-status",
    ).length,
    0,
    "Checkout should not redirect straight to Transaction Status Page",
  );
  const flowEdges = buildEdges(apex, layout.positions);
  assert.ok(flowEdges.length > 0);
  const markerColors = new Set<string>();
  for (const flowEdge of flowEdges) {
    const stroke = flowEdge.style?.stroke;
    assert.equal(typeof stroke, "string", `edge ${flowEdge.id} should have a stroke color`);
    assert.deepEqual(
      flowEdge.markerEnd,
      { type: "arrowclosed", orient: "auto", color: stroke },
      `edge ${flowEdge.id} arrowhead should match its own stroke color`,
    );
    markerColors.add(String(stroke));
  }
  assert.ok(
    markerColors.size > 1,
    "arrowheads should use per-edge colors, not one shared fill across all edges",
  );
  const flowObserve = flowEdges.find((e) => e.id === observeEdge!.id);
  const sampleRendersOn = apex.edges.find((e) => e.rel === "rendersOn");
  assert.ok(flowObserve && sampleRendersOn);
  const flowRendersOn = flowEdges.find((e) => e.id === sampleRendersOn.id);
  assert.ok(flowRendersOn);
  assert.equal(
    flowObserve.style?.stroke,
    flowRendersOn.style?.stroke,
    "observes (data table→automation) should match data table→UI (rendersOn) stroke color",
  );
  const updateEdges = apex.edges.filter((e) => e.rel === "updates");
  assert.ok(updateEdges.length > 0);
  for (const edge of updateEdges) {
    const flow = flowEdges.find((e) => e.id === edge.id);
    assert.ok(flow);
    assert.equal(
      flow.style?.strokeWidth,
      2.5,
      `event→data table edge ${edge.id} should match main-line stroke width`,
    );
  }
  const byRel = new Map<string, typeof flowEdges>();
  for (const edge of apex.edges) {
    const flow = flowEdges.find((e) => e.id === edge.id);
    assert.ok(flow);
    const list = byRel.get(edge.rel) ?? [];
    list.push(flow);
    byRel.set(edge.rel, list);
  }
  for (const rel of ["issues", "produces", "updates", "rendersOn", "observes", "ordersBefore"] as const) {
    const list = byRel.get(rel) ?? [];
    assert.ok(list.length > 0, `${rel} edges should exist`);
    for (const flow of list) {
      assert.equal(
        flow.type,
        VERTICAL_ENTRY_EDGE_TYPE,
        `${rel} edge ${flow.id} should use deepened Bezier entry`,
      );
    }
  }
  for (const flow of byRel.get("loopsBack") ?? []) {
    assert.equal(flow.type, "smoothstep", "loopsBack stays smoothstep");
  }
  // Bottom-handle entry: end control sits directly below the target.
  const [bottomPath] = getVerticalEntryPath(0, 100, 200, 0, Position.Top, Position.Bottom);
  const bottomC2 = bottomPath.match(/C[-\d.]+,[-\d.]+ ([-\d.]+),([-\d.]+) 200,0$/);
  assert.ok(bottomC2);
  assert.equal(Number(bottomC2[1]), 200);
  assert.ok(Number(bottomC2[2]) > 0, "bottom entry bends up from below into the arrow");
  // Top-handle entry: end control sits directly above the target.
  const [topPath] = getVerticalEntryPath(0, 0, 0, 100, Position.Bottom, Position.Top);
  const topC2 = topPath.match(/C[-\d.]+,[-\d.]+ ([-\d.]+),([-\d.]+) 0,100$/);
  assert.ok(topC2);
  assert.equal(Number(topC2[1]), 0);
  assert.ok(Number(topC2[2]) < 100, "top entry bends down from above into the arrow");
  // Redirects: leave source right, enter target top, Bezier (no overhead smoothstep).
  for (const edge of [redirect, checkoutToSuccess, checkoutToFailure, successToStatus, failureToStatus]) {
    const flowRedirect = flowEdges.find((e) => e.id === edge!.id);
    assert.ok(flowRedirect);
    assert.equal(flowRedirect.type, VERTICAL_ENTRY_EDGE_TYPE);
    assert.equal(flowRedirect.sourceHandle, "r-out");
    assert.equal(flowRedirect.targetHandle, "t-in");
    assert.equal(flowRedirect.label, "redirect");
    assert.equal(flowRedirect.pathOptions, undefined);
    assert.match(String(flowRedirect.style?.strokeDasharray ?? ""), /5/);
  }
  // Clear-of-stickies redirect path: sharp early rise; label at the apex peak.
  const [clearPath, labelX, labelY] = getRedirectClearPath(100, 200, 400, 160);
  assert.match(clearPath, /^M100,200 C/);
  assert.ok(clearPath.includes("400,160"), "path ends at target top");
  // First cubic ends near the source (early rise), not mid-span.
  const firstCubicEnd = clearPath.match(/^M[\d.]+,[\d.]+ C[\d.]+,[\d.]+ [\d.]+,[\d.]+ ([\d.]+),([\d.]+)/);
  assert.ok(firstCubicEnd);
  assert.ok(Number(firstCubicEnd[1]) < 100 + 100, "rise completes early near the source");
  assert.ok(Number(firstCubicEnd[2]) < 160 - 40, "early segment reaches apex height");
  assert.equal(labelY, Number(firstCubicEnd[2]), "redirect label sits on the peak height");
  assert.ok(labelX > Number(firstCubicEnd[1]), "redirect label sits along the peak run");
  const [rightTopPath, rtLabelX, rtLabelY] = getVerticalEntryPath(
    100,
    200,
    400,
    160,
    Position.Right,
    Position.Top,
  );
  assert.equal(rightTopPath, clearPath);
  assert.equal(rtLabelX, labelX);
  assert.equal(rtLabelY, labelY);
});

test("formatParentsLabel uses singular Location and comma-separates many", () => {
  assert.equal(formatParentsLabel([]), null);
  assert.equal(formatParentsLabel(["License Purchase Page"]), "Location: License Purchase Page");
  assert.equal(
    formatParentsLabel(["License Purchase Page", "Transaction Status Page"]),
    "Locations: License Purchase Page, Transaction Status Page",
  );
});

test("sticky markup groups kind and parent in a header band with group spacing in CSS", () => {
  const stickySrc = readFileSync(join(here, "StickyNode.tsx"), "utf8");
  const cssSrc = readFileSync(join(here, "styles.css"), "utf8");
  assert.match(stickySrc, /className="sticky-header"/);
  assert.match(
    stickySrc,
    /sticky-header[\s\S]*?className="kind"[\s\S]*?contextInHeader[\s\S]*?sticky-parents[\s\S]*?className="name"/,
  );
  assert.match(stickySrc, /contextInHeader[\s\S]*kind === "command"[\s\S]*kind === "event"/);
  assert.match(
    stickySrc,
    /dataTableMetaBelow[\s\S]*contextLabel[\s\S]*sticky-data-table-context[\s\S]*whoLabel[\s\S]*sticky-parents/,
  );
  assert.match(stickySrc, /whoInHeader[\s\S]*kind === "automation"/);
  assert.match(cssSrc, /\.sticky-header\s*\{[^}]*gap:\s*0\.1rem/s);
  assert.match(cssSrc, /\.sticky-header\s*\{[^}]*margin-bottom:\s*0\.42rem/s);
  assert.match(cssSrc, /\.sticky-lane\s*\{[^}]*margin-top:\s*0\.4rem/s);
  assert.match(cssSrc, /\.sticky-header \.sticky-lane\s*\{[^}]*margin-top:\s*0/s);
  assert.match(cssSrc, /\.sticky\s*\{[^}]*padding:\s*0\.72rem 0\.8rem/s);
});

test("Location (parent) and Context share quieter meta style vs Who lane, except triggers flip", () => {
  const stickySrc = readFileSync(join(here, "StickyNode.tsx"), "utf8");
  const cssSrc = readFileSync(join(here, "styles.css"), "utf8");
  const parentsBlock = cssSrc.match(/\.sticky-parents\s*\{[^}]+\}/s)?.[0] ?? "";
  const laneBlock = cssSrc.match(/\.sticky-lane\s*\{[^}]+\}/s)?.[0] ?? "";
  const triggerLocationBlock =
    cssSrc.match(/\.sticky-trigger-location\s*\{[^}]+\}/s)?.[0] ?? "";
  assert.match(parentsBlock, /font-style:\s*italic/);
  assert.match(parentsBlock, /opacity:\s*0\.62/);
  assert.match(parentsBlock, /font-weight:\s*500/);
  assert.match(laneBlock, /font-weight:\s*600/);
  assert.match(laneBlock, /opacity:\s*0\.82/);
  assert.doesNotMatch(laneBlock, /font-style:\s*italic/);
  const forBlock = cssSrc.match(/\.sticky-data-table-context\s*\{[^}]+\}/s)?.[0] ?? "";
  assert.match(triggerLocationBlock, /font-weight:\s*500/);
  assert.match(triggerLocationBlock, /font-style:\s*italic/);
  assert.match(triggerLocationBlock, /opacity:\s*1/);
  assert.match(forBlock, /font-weight:\s*500/);
  assert.match(forBlock, /font-style:\s*italic/);
  assert.match(stickySrc, /isTriggerUi \? "sticky-trigger-location" : "sticky-parents"/);
  assert.match(stickySrc, /isTriggerUi \? "sticky-parents" : "sticky-lane"/);
  // Context on commands/events reuses Location's sticky-parents class in the header.
  assert.match(
    stickySrc,
    /contextInHeader \? <div className="sticky-parents">\{d\.laneLabel\}<\/div>/,
  );
  // Automation Who sits in the header (no "Who:" prefix) with sticky-lane styling.
  assert.match(stickySrc, /automationWhoLabel/);
  assert.match(stickySrc, /replace\(\/\^Who:\\s\*\/i/);
  assert.match(
    stickySrc,
    /automationWhoLabel \? <div className="sticky-lane">\{automationWhoLabel\}<\/div>/,
  );
});

test("external checkout uses External Web Page kind with no separate External badge signal in data", () => {
  const checkout = apex.nodes.find((n) => n.id === "trg-paystack-checkout");
  assert.ok(checkout?.type === "trigger" && checkout.external === true);
  assert.equal(
    formatUiCategoryLabel({
      kind: "trigger",
      name: checkout.name,
      external: true,
    }),
    "External Web Page",
  );
  const payButton = apex.nodes.find((n) => n.id === "trg-license-checkout-modal");
  assert.ok(payButton?.type === "trigger");
  assert.equal(
    formatUiCategoryLabel({
      kind: "trigger",
      name: payButton.name,
      parents: payButton.parents,
    }),
    "Element In Web Page",
  );
  assert.equal(
    formatParentsLabel(payButton.parents ?? []),
    "Location: License Purchase Page",
  );
});

test("formatKindLabel restores object names including Data Table", () => {
  assert.equal(formatKindLabel("dataTable"), "Data Table");
  assert.equal(formatKindLabel("event"), "Event");
  assert.equal(formatKindLabel("command"), "Command");
  assert.equal(formatKindLabel("trigger"), "Trigger");
});

test("formatUiCategoryLabel maps UI stickies to singular trigger-lane categories", () => {
  assert.equal(
    formatUiCategoryLabel({ kind: "screen", name: "License Purchase Page" }),
    "Web Page",
  );
  assert.equal(
    formatUiCategoryLabel({ kind: "screen", name: "Mobile sign-in" }),
    "Mobile App Screen",
  );
  assert.equal(
    formatUiCategoryLabel({
      kind: "trigger",
      name: "License Checkout Modal",
      parents: ["License Purchase Page"],
    }),
    "Element In Web Page",
  );
  assert.equal(
    formatUiCategoryLabel({
      kind: "trigger",
      name: "Paystack Checkout Page",
      external: true,
    }),
    "External Web Page",
  );
  assert.equal(
    formatUiCategoryLabel({
      kind: "trigger",
      name: "Success Auto-Redirect URL",
      autoRedirect: true,
    }),
    "Auto-Redirect URL",
  );
  assert.equal(
    formatUiCategoryLabel({ kind: "screen", name: "Transaction Status Page" }),
    "Web Page",
  );
  assert.equal(
    formatUiCategoryLabel({ kind: "automation", name: "Paystack webhook" }),
    "Automation",
  );
  assert.equal(formatUiCategoryLabel({ kind: "event", name: "Paid" }), undefined);
  assert.equal(
    formatStickyKindLabel({ kind: "event", name: "Paid" }),
    "Event",
  );
});

test("resolveUiKindIconKey maps each UI trigger/screen category to a distinct icon", () => {
  assert.equal(
    resolveUiKindIconKey({ kind: "automation", name: "Paystack webhook" }),
    "automation",
  );
  assert.equal(
    resolveUiKindIconKey({
      kind: "trigger",
      name: "Paystack Checkout Page",
      external: true,
    }),
    "externalWebPage",
  );
  assert.equal(
    resolveUiKindIconKey({
      kind: "trigger",
      name: "Success Auto-Redirect URL",
      autoRedirect: true,
    }),
    "autoRedirect",
  );
  assert.equal(
    resolveUiKindIconKey({
      kind: "trigger",
      name: "Failure Auto-Redirect URL",
      autoRedirect: true,
    }),
    "autoRedirect",
  );
  assert.equal(
    resolveUiKindIconKey({
      kind: "trigger",
      name: "License Checkout Modal",
      parents: ["License Purchase Page"],
    }),
    "elementInWebPage",
  );
  assert.equal(
    resolveUiKindIconKey({
      kind: "trigger",
      name: "Mobile · Pay",
      parents: ["Mobile billing"],
    }),
    "elementOnMobile",
  );
  assert.equal(
    resolveUiKindIconKey({ kind: "screen", name: "Transaction Status Page" }),
    "webPage",
  );
  assert.equal(
    resolveUiKindIconKey({ kind: "screen", name: "Mobile sign-in" }),
    "mobileAppScreen",
  );
  assert.equal(resolveUiKindIconKey({ kind: "event", name: "Paid" }), null);
  assert.equal(UI_KIND_LUCIDE_ICONS.automation, "Cog");
  assert.equal(UI_KIND_LUCIDE_ICONS.externalWebPage, "Globe");
  assert.equal(UI_KIND_LUCIDE_ICONS.autoRedirect, "SquareArrowOutUpRight");
  assert.equal(UI_KIND_LUCIDE_ICONS.elementInWebPage, "MousePointer2");
  assert.equal(UI_KIND_LUCIDE_ICONS.elementOnMobile, "Smartphone + Circle");
  assert.equal(UI_KIND_LUCIDE_ICONS.webPage, "AppWindow");
  assert.equal(UI_KIND_LUCIDE_ICONS.mobileAppScreen, "Smartphone");
});

test("formatLaneLabel uses Who: for ui bands and Context: otherwise", () => {
  assert.equal(formatLaneLabel("ui", "authenticated learner"), "Who: Authenticated Learner");
  assert.equal(formatLaneLabel("events", "paystack transaction"), "Context: Paystack Transaction");
  assert.equal(formatLaneLabel("commandView", "commands"), "Context: Commands");
  assert.equal(formatLaneLabel(undefined, undefined), undefined);
});

test("timeline stickies carry Who:/For:/Context: lane labels on every item type", () => {
  const streamNameById = new Map(apex.streams.map((s) => [s.id, s.name]));
  const streamById = new Map(apex.streams.map((s) => [s.id, s]));
  const nodeById = new Map(apex.nodes.map((n) => [n.id, n]));
  const laneFor = (streamId: string | undefined) =>
    formatLaneLabel(streamById.get(streamId ?? "")?.band, streamNameById.get(streamId ?? ""));
  const commandStreamId = (commandId: string) => {
    const streamIds = new Set<string>();
    for (const edge of apex.edges) {
      if (edge.rel !== "produces" || edge.from !== commandId) continue;
      const produced = nodeById.get(edge.to);
      if (produced?.type === "event") streamIds.add(produced.streamId);
    }
    return streamIds.size === 1 ? [...streamIds][0] : undefined;
  };

  const payTrigger = apex.nodes.find((n) => n.id === "trg-license-checkout-modal");
  assert.ok(payTrigger && payTrigger.type === "trigger");
  assert.match(String(laneFor(payTrigger.streamId)), /^Who: /);

  const openCohortWindowsTable = apex.nodes.find((n) => n.id === "data-table-open-cohort-windows");
  assert.ok(openCohortWindowsTable && openCohortWindowsTable.type === "dataTable");
  assert.equal(
    laneFor(dataTableWhoStreamId(apex, openCohortWindowsTable.id)),
    "Who: Authenticated Learner",
  );
  assert.equal(
    formatDataTableLaneLabel(apex, openCohortWindowsTable.id),
    "For: License Purchase Page",
  );

  const checkoutTable = apex.nodes.find((n) => n.id === "data-table-paystack-checkout");
  assert.ok(checkoutTable && checkoutTable.type === "dataTable");
  assert.equal(
    laneFor(dataTableWhoStreamId(apex, checkoutTable.id)),
    "Who: Authenticated Learner",
  );
  assert.equal(
    formatDataTableLaneLabel(apex, checkoutTable.id),
    "For: License Purchase Page",
  );

  const initiatedLicensePurchases = apex.nodes.find(
    (n) => n.id === "data-table-initiated-license-purchases",
  );
  const subCharge = apex.nodes.find((n) => n.id === "auto-subscription-charge");
  assert.ok(initiatedLicensePurchases?.type === "dataTable" && subCharge?.type === "automation");
  assert.equal(
    dataTableWhoStreamId(apex, initiatedLicensePurchases.id),
    subCharge.streamId,
  );
  assert.equal(
    laneFor(dataTableWhoStreamId(apex, initiatedLicensePurchases.id)),
    "Who: License Purchase Process Manager",
  );
  assert.equal(
    formatDataTableLaneLabel(apex, initiatedLicensePurchases.id),
    "For: Trigger Paystack Payment",
    "Initiated License Purchases Context is the automation that consumes it",
  );
  assert.equal(laneFor(subCharge.streamId), "Who: License Purchase Process Manager");
  assert.match(String(laneFor(subCharge.streamId)), /^Who: /);

  const chargeEvt = apex.nodes.find((n) => n.id === "evt-single-charge-initiated");
  assert.ok(chargeEvt && chargeEvt.type === "event");
  assert.match(String(laneFor(chargeEvt.streamId)), /^Context: /);

  const initiateCmd = apex.nodes.find((n) => n.id === "cmd-initiate-single-charge");
  assert.ok(initiateCmd && initiateCmd.type === "command");
  assert.match(String(laneFor(commandStreamId(initiateCmd.id) ?? initiateCmd.streamId)), /^Context: /);

  const paymentPage = apex.nodes.find((n) => n.id === "scr-payment-page");
  assert.ok(paymentPage && paymentPage.type === "screen");
  assert.match(String(laneFor(paymentPage.streamId)), /^Who: /);
});
