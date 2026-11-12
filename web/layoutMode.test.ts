import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { BlueprintDocumentSchema } from "../src/document.js";
import { Position } from "@xyflow/react";
import { buildEdges, SOURCE_STROKE, VERTICAL_ENTRY_EDGE_TYPE } from "./edges.js";
import { computeLayout } from "./layout.js";
import { NODE_H } from "./layoutMetrics.js";
import {
  automationActorLabel,
  dataTableWhoStreamId,
  formatDataTableLaneLabel,
  formatLaneLabel,
} from "./laneLabel.js";
import {
  formatKindLabel,
  formatExternalLabel,
  formatParentsLabel,
  formatStickyKindLabel,
  formatTriggerFieldGroupLabel,
  formatUiCategoryLabel,
  groupTriggerFields,
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
    ["cohort_window_id", "name", "price_in_kobo", "payment_method", "user_id"],
  );
  assert.deepEqual(
    payTrigger.fields?.map((f) => f.category),
    ["presented", "presented", "presented", "collected", "metadata"],
    "License Checkout Modal groups Data Presented, then Data Collected, then Metadata",
  );
  assert.equal(
    payTrigger.fields?.find((f) => f.name === "payment_method")?.type,
    "atom",
  );
  assert.match(
    String(payTrigger.fields?.find((f) => f.name === "payment_method")?.description),
    /Payment method collected from the learner at checkout\. One of either Paystack or Monnify\./,
  );
  assert.deepEqual(
    groupTriggerFields(payTrigger.fields ?? []).map((group) => group.label),
    ["Data Presented", "Data Collected", "Metadata"],
  );
  const initiateLicense = apex.nodes.find((n) => n.id === "cmd-initiate-license-purchase");
  assert.ok(initiateLicense?.type === "command");
  assert.equal(initiateLicense.name, "Initiate License Purchase");
  assert.deepEqual(initiateLicense.produces, ["evt-license-purchase-initiated"]);
  assert.deepEqual(
    initiateLicense.fields?.map((f) => [f.name, f.type]),
    [
      ["license_purchase_id", "auto_generated_uuid"],
      ["user_id", "uuid"],
      ["cohort_window_id", "uuid"],
      ["payment_method", "atom"],
    ],
  );
  assert.equal(initiateLicense.input[0]?.source.kind, "generated");
  assert.equal(
    initiateLicense.fields?.find((f) => f.name === "payment_method")?.type,
    "atom",
  );
  assert.match(
    String(initiateLicense.fields?.find((f) => f.name === "payment_method")?.description),
    /Payment method collected from the learner at checkout\. One of either Paystack or Monnify\./,
  );
  assert.deepEqual(
    initiateLicense.input.map((f) => f.name),
    ["license_purchase_id", "user_id", "cohort_window_id", "payment_method"],
  );
  assert.equal(
    initiateLicense.input.find((f) => f.name === "payment_method")?.type,
    "atom",
  );
  const licenseInitiated = apex.nodes.find((n) => n.id === "evt-license-purchase-initiated");
  assert.ok(licenseInitiated?.type === "event");
  assert.equal(licenseInitiated.name, "License Purchase Initiated");
  assert.equal(licenseInitiated.streamId, "stream-licensing");
  assert.deepEqual(
    licenseInitiated.fields?.map((f) => [f.name, f.type]),
    [
      ["license_purchase_id", "uuid"],
      ["user_id", "uuid"],
      ["cohort_window_id", "uuid"],
      ["payment_method", "atom"],
    ],
  );
  assert.equal(
    licenseInitiated.fields?.find((f) => f.name === "payment_method")?.type,
    "atom",
  );
  assert.match(
    String(licenseInitiated.fields?.find((f) => f.name === "payment_method")?.description),
    /Payment method collected from the learner when the license purchase was initiated\. One of either Paystack or Monnify\./,
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
  assert.equal(licensingStream.name, "customer wants access to the app");
  const initiatedLicenseTable = apex.nodes.find(
    (n) => n.id === "data-table-initiated-license-purchases",
  );
  assert.ok(initiatedLicenseTable?.type === "dataTable");
  assert.equal(initiatedLicenseTable.name, "Initiated License Purchases");
  assert.deepEqual(initiatedLicenseTable.fedBy, ["evt-license-purchase-initiated"]);
  assert.deepEqual(
    initiatedLicenseTable.fields.map((f) => [f.name, f.type]),
    [
      ["license_purchase_id", "uuid"],
      ["user_id", "uuid"],
      ["cohort_window_id", "uuid"],
    ],
  );
  assert.equal(
    initiatedLicenseTable.fields[0]?.source.kind === "fromEvent"
      ? initiatedLicenseTable.fields[0].source.field
      : undefined,
    "license_purchase_id",
  );
  const openCohortWindows = apex.nodes.find((n) => n.id === "data-table-open-cohort-windows");
  assert.ok(openCohortWindows?.type === "dataTable");
  assert.equal(openCohortWindows.name, "Open Cohort Windows");
  assert.equal(openCohortWindows.sliceId, "slice-available-license-cards");
  assert.deepEqual(openCohortWindows.fedBy, ["evt-cohort-window-opened"]);
  assert.deepEqual(
    openCohortWindows.fields.map((f) => f.name),
    ["cohort_window_id", "name", "price_in_kobo"],
  );
  assert.equal(
    openCohortWindows.fields.some((f) => f.name === "program"),
    false,
    "Open Cohort Windows must not include program",
  );
  const availableLicenseCards = apex.nodes.find((n) => n.id === "trg-available-license-cards");
  assert.ok(availableLicenseCards?.type === "trigger");
  assert.equal(availableLicenseCards.name, "Available License Cards");
  assert.equal(availableLicenseCards.sliceId, "slice-available-license-cards");
  assert.deepEqual(availableLicenseCards.parents, ["License Purchase Page"]);
  assert.deepEqual(
    availableLicenseCards.fields?.map((f) => f.name),
    ["cohort_window_id", "name"],
  );
  assert.equal(
    availableLicenseCards.fields?.some((f) => f.name === "price_in_kobo"),
    false,
    "Available License Cards does not show price",
  );
  assert.deepEqual(
    availableLicenseCards.fields?.map((f) => f.category),
    ["presented", "presented"],
    "Available License Cards fields are Data Presented",
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
    ["cohort_window_id", "program", "name", "price_in_kobo"],
  );
  assert.ok(
    cohortOpened.fields?.some((f) => f.name === "price_in_kobo"),
    "Cohort Window Opened event still keeps price",
  );
  assert.equal(cohortOpened.fields?.find((f) => f.name === "price_in_kobo")?.type, "integer");
  assert.match(
    String(cohortOpened.fields?.find((f) => f.name === "price_in_kobo")?.description),
    /cobalt/i,
  );
  assert.equal(cohortOpened.fields?.find((f) => f.name === "cohort_window_id")?.type, "uuid");
  assert.equal(cohortOpened.fields?.find((f) => f.name === "program")?.type, "atom");
  assert.match(
    String(cohortOpened.fields?.find((f) => f.name === "program")?.description),
    /MMDP and Assistant Director/,
  );
  const openCohortWindowFields = apex.nodes.find((n) => n.id === "cmd-open-cohort-window");
  assert.ok(openCohortWindowFields?.type === "command");
  assert.deepEqual(
    openCohortWindowFields.fields?.map((f) => [f.name, f.type]),
    [
      ["cohort_window_id", "auto_generated_uuid"],
      ["program", "atom"],
      ["name", "string"],
      ["price_in_kobo", "integer"],
    ],
  );
  assert.equal(openCohortWindowFields.input[0]?.source.kind, "generated");
  assert.equal(
    openCohortWindowFields.fields?.find((f) => f.name === "cohort_window_id")?.description,
    "Auto-generated ID for this cohort window.",
  );
  for (const name of ["program", "name", "price_in_kobo"]) {
    assert.equal(
      openCohortWindowFields.fields?.find((f) => f.name === name)?.description,
      cohortOpened.fields?.find((f) => f.name === name)?.description,
    );
  }
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
    "Open Cohort Windows Context is the License Purchase Page, not a component on it",
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
  assert.equal(subChargeAuto.name, "Paystack Payment Initiator");
  assert.equal(subChargeAuto.streamId, "lane-authenticated-learner");
  assert.equal(
    automationActorLabel(subChargeAuto.id, "Who: Authenticated Learner"),
    undefined,
    "Paystack Payment Initiator has no separate actor line",
  );
  assert.equal(
    apex.streams.find((s) => s.id === "lane-license-purchase-process-manager"),
    undefined,
  );
  assert.equal(
    apex.streams.some((s) => s.name === "License Purchase Process Manager"),
    false,
  );
  assert.deepEqual(subChargeAuto.observes, [
    "data-table-initiated-license-purchases",
    "data-table-registered-emails",
    "data-table-cohort-window-prices",
  ]);
  assert.equal(subChargeAuto.external, "Paystack's Initiate Payment API Endpoint");
  assert.deepEqual(
    subChargeAuto.fields?.map((field) => [field.name, field.type, field.category]),
    [
      ["email", "string", "presented"],
      ["amount_in_kobo", "integer", "presented"],
      ["success_url", "string", "presented"],
      ["failure_url", "string", "presented"],
    ],
  );
  assert.match(String(subChargeAuto.fields?.find((field) => field.name === "email")?.description), /Derived directly from Registered Emails/);
  assert.match(String(subChargeAuto.fields?.find((field) => field.name === "amount_in_kobo")?.description), /Derived from the price_in_kobo field of Cohort Window Prices/);
  assert.match(String(subChargeAuto.fields?.find((field) => field.name === "success_url")?.description), /Derived from the license purchase ID on Initiated License Purchases/);
  assert.match(String(subChargeAuto.fields?.find((field) => field.name === "success_url")?.description), /callback_url/);
  assert.match(String(subChargeAuto.fields?.find((field) => field.name === "failure_url")?.description), /Derived from the same license purchase ID on Initiated License Purchases/);
  assert.match(String(subChargeAuto.fields?.find((field) => field.name === "failure_url")?.description), /cancel_action/);
  assert.equal(formatExternalLabel(subChargeAuto.external), "External: Paystack's Initiate Payment API Endpoint");
  assert.deepEqual(
    subChargeAuto.apiClientResponse?.map((responseCase) => responseCase.label),
    ["Success", "Error"],
  );
  const singleCharge = apex.nodes.find((n) => n.id === "cmd-initiate-single-charge");
  assert.ok(singleCharge?.type === "command");
  assert.equal(singleCharge.apiClientResponse, undefined);
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
    "Paystack Payment Initiator should issue Initiate Single Charge",
  );
  const observeEdge = apex.edges.find(
    (e) =>
      e.rel === "observes" &&
      e.from === "data-table-initiated-license-purchases" &&
      e.to === "auto-subscription-charge",
  );
  assert.ok(
    observeEdge,
    "Initiated License Purchases should connect into Paystack Payment Initiator",
  );
  const registeredEmails = apex.nodes.find((n) => n.id === "data-table-registered-emails");
  assert.ok(registeredEmails?.type === "dataTable");
  assert.equal(registeredEmails.name, "Registered Emails");
  assert.deepEqual(
    registeredEmails.fields.map((field) => [field.name, field.type]),
    [
      ["user_id", "uuid"],
      ["email", "string"],
    ],
  );
  assert.equal(
    formatDataTableLaneLabel(apex, registeredEmails.id),
    "For: Paystack Payment Initiator",
  );
  assert.ok(
    apex.edges.some(
      (e) =>
        e.rel === "observes" &&
        e.from === "data-table-registered-emails" &&
        e.to === "auto-subscription-charge",
    ),
    "Registered Emails should connect into Paystack Payment Initiator",
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
  const registeredEmailsPos = layout.positions.get("data-table-registered-emails");
  const subChargePos = layout.positions.get("auto-subscription-charge");
  const singleChargePos = layout.positions.get("cmd-initiate-single-charge");
  assert.ok(
    initiateLicensePos &&
      licenseInitiatedPos &&
      initiatedLicensePos &&
      registeredEmailsPos &&
      subChargePos &&
      singleChargePos,
  );
  assert.equal(registeredEmailsPos.y, initiatedLicensePos.y);
  assert.ok(registeredEmailsPos.x > initiatedLicensePos.x);
  const userRegistered = apex.nodes.find((n) => n.id === "evt-user-registered");
  assert.ok(userRegistered?.type === "event");
  assert.equal(userRegistered.name, "User Registered");
  assert.equal(userRegistered.streamId, "stream-user");
  assert.deepEqual(
    userRegistered.fields?.map((field) => [field.name, field.type]),
    [
      ["user_id", "uuid"],
      ["hashed_email", "string"],
    ],
  );
  assert.match(
    String(userRegistered.fields?.find((field) => field.name === "hashed_email")?.description),
    /Stored as a hashed email, not plain\./,
  );
  const registeredEmail = registeredEmails.fields.find((field) => field.name === "email");
  assert.equal(registeredEmail?.source.kind, "fromEvent");
  assert.equal(
    registeredEmail?.source.kind === "fromEvent" ? registeredEmail.source.note : undefined,
    "Decrypted from the hashed email.",
  );
  assert.equal(
    apex.nodes.some((n) => n.type === "command" && n.produces.includes("evt-user-registered")),
    false,
    "User Registered is not wired to a command",
  );
  assert.deepEqual(
    apex.edges.filter((e) => e.from === "evt-user-registered" || e.to === "evt-user-registered").map((e) => e.rel),
    ["updates"],
  );
  assert.deepEqual(registeredEmails.fedBy, ["evt-user-registered"]);
  const userRegisteredPos = layout.positions.get("evt-user-registered");
  assert.ok(userRegisteredPos);
  assert.equal(userRegisteredPos.x, registeredEmailsPos.x);
  assert.equal(userRegisteredPos.y, licenseInitiatedPos.y);
  const cohortWindowPrices = apex.nodes.find((n) => n.id === "data-table-cohort-window-prices");
  assert.ok(cohortWindowPrices?.type === "dataTable");
  assert.equal(cohortWindowPrices.name, "Cohort Window Prices");
  assert.deepEqual(
    cohortWindowPrices.fields.map((field) => [field.name, field.type]),
    [
      ["cohort_window_id", "uuid"],
      ["price_in_kobo", "integer"],
    ],
  );
  assert.deepEqual(cohortWindowPrices.fedBy, ["evt-cohort-window-opened"]);
  assert.equal(
    formatDataTableLaneLabel(apex, cohortWindowPrices.id),
    "For: Paystack Payment Initiator",
  );
  assert.ok(
    apex.edges.some(
      (e) =>
        e.rel === "updates" &&
        e.from === "evt-cohort-window-opened" &&
        e.to === "data-table-cohort-window-prices",
    ),
    "Cohort Window Opened should feed Cohort Window Prices",
  );
  assert.ok(
    apex.edges.some(
      (e) =>
        e.rel === "observes" &&
        e.from === "data-table-cohort-window-prices" &&
        e.to === "auto-subscription-charge",
    ),
    "Cohort Window Prices should connect into Paystack Payment Initiator",
  );
  const cohortOpenedPos = layout.positions.get("evt-cohort-window-opened");
  const cohortWindowPricesPos = layout.positions.get("data-table-cohort-window-prices");
  assert.ok(cohortOpenedPos && cohortWindowPricesPos);
  assert.equal(cohortWindowPricesPos.y, registeredEmailsPos.y);
  assert.ok(cohortWindowPricesPos.x > registeredEmailsPos.x);
  assert.ok(cohortOpenedPos.x < licenseInitiatedPos.x);
  const openCohortWindow = apex.nodes.find((n) => n.id === "cmd-open-cohort-window");
  assert.ok(openCohortWindow?.type === "command");
  assert.equal(openCohortWindow.name, "Open Cohort Window");
  assert.deepEqual(openCohortWindow.produces, ["evt-cohort-window-opened"]);
  assert.ok(
    apex.edges.some(
      (e) =>
        e.rel === "produces" &&
        e.from === "cmd-open-cohort-window" &&
        e.to === "evt-cohort-window-opened",
    ),
    "Open Cohort Window should produce Cohort Window Opened",
  );
  const openCohortWindowPos = layout.positions.get("cmd-open-cohort-window");
  assert.ok(openCohortWindowPos);
  assert.equal(openCohortWindowPos.x, cohortOpenedPos.x);
  assert.ok(openCohortWindowPos.y < cohortOpenedPos.y);
  const windowOpeningForm = apex.nodes.find((n) => n.id === "trg-window-opening-form");
  assert.ok(windowOpeningForm?.type === "trigger");
  assert.equal(windowOpeningForm.name, "Window Opening Form");
  assert.equal(windowOpeningForm.notes, undefined);
  assert.deepEqual(windowOpeningForm.parents, ["Cohort Window Page"]);
  assert.equal(windowOpeningForm.actor, "Product admin");
  assert.deepEqual(
    groupTriggerFields(windowOpeningForm.fields ?? []).map((group) => [group.label, group.fields.map((field) => [field.name, field.type])]),
    [["Data Collected", [
      ["program", "atom"],
      ["name", "string"],
      ["price_in_kobo", "integer"],
    ]]],
  );
  assert.equal(
    formatUiCategoryLabel({ kind: windowOpeningForm.type, name: windowOpeningForm.name, parents: windowOpeningForm.parents }),
    "webpage components",
  );
  assert.equal(
    formatParentsLabel(windowOpeningForm.parents ?? []),
    "Location: Cohort Window Page",
  );
  assert.ok(
    apex.edges.some(
      (e) => e.rel === "issues" && e.from === "trg-window-opening-form" && e.to === "cmd-open-cohort-window",
    ),
    "Window Opening Form should issue Open Cohort Window",
  );
  const windowOpeningFormPos = layout.positions.get("trg-window-opening-form");
  assert.ok(windowOpeningFormPos);
  assert.equal(windowOpeningFormPos.x, openCohortWindowPos.x);
  assert.ok(windowOpeningFormPos.y < openCohortWindowPos.y);
  const openWindowList = apex.nodes.find((n) => n.id === "trg-open-window-list");
  assert.ok(openWindowList?.type === "trigger");
  assert.equal(openWindowList.name, "Open Window List");
  assert.equal(openWindowList.actor, "Product admin");
  assert.deepEqual(openWindowList.parents, ["Cohort Window Page"]);
  assert.equal(
    formatUiCategoryLabel({ kind: openWindowList.type, name: openWindowList.name, parents: openWindowList.parents }),
    "webpage components",
  );
  const openWindows = apex.nodes.find((n) => n.id === "data-table-open-windows");
  assert.ok(openWindows?.type === "dataTable");
  assert.equal(openWindows.name, "Open Windows");
  assert.deepEqual(openWindows.fedBy, ["evt-cohort-window-opened"]);
  assert.deepEqual(
    openWindows.fields.map((field) => [field.name, field.type]),
    [
      ["cohort_window_id", "uuid"],
      ["program", "atom"],
      ["name", "string"],
      ["price_in_kobo", "integer"],
    ],
  );
  assert.equal(formatDataTableLaneLabel(apex, openWindows.id), "For: Cohort Window Page");
  assert.ok(
    apex.edges.some(
      (e) =>
        e.rel === "updates" &&
        e.from === "evt-cohort-window-opened" &&
        e.to === "data-table-open-windows",
    ),
    "Cohort Window Opened should feed Open Windows",
  );
  assert.ok(
    apex.edges.some(
      (e) =>
        e.rel === "rendersOn" &&
        e.from === "data-table-open-windows" &&
        e.to === "trg-open-window-list",
    ),
    "Open Windows should feed Open Window List",
  );
  const openWindowsPos = layout.positions.get("data-table-open-windows");
  const openWindowListPos = layout.positions.get("trg-open-window-list");
  assert.ok(openWindowsPos && openWindowListPos);
  assert.ok(openWindowsPos.x > windowOpeningFormPos.x);
  assert.equal(openWindowListPos.x, openWindowsPos.x);
  assert.equal(openWindowListPos.y, windowOpeningFormPos.y);
  assert.equal(openWindowsPos.y, openCohortWindowPos.y);
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
  assert.equal(flowObserve.style?.stroke, SOURCE_STROKE.dataTable);
  assert.equal(SOURCE_STROKE.automation, SOURCE_STROKE.trigger);
  assert.equal(SOURCE_STROKE.event, "#f8d04d");
  const issueFromAutomation = flowEdges.find((e) => e.id === "em-issue-10");
  assert.equal(issueFromAutomation?.style?.stroke, SOURCE_STROKE.trigger);
  const strokeById = new Map(flowEdges.map((e) => [e.id, e.style?.stroke]));
  const sourceType = new Map(apex.nodes.map((n) => [n.id, n.type]));
  assert.equal(
    strokeById.get("em-issue-9"),
    SOURCE_STROKE.trigger,
    "trigger → command arrow matches the trigger",
  );
  assert.equal(
    strokeById.get("em-produce-cmd-initiate-license-purchase-evt-license-purchase-initiated"),
    SOURCE_STROKE.command,
    "command → event arrow matches the command",
  );
  assert.equal(
    strokeById.get("em-update-data-table-initiated-license-purchases-evt-license-purchase-initiated"),
    SOURCE_STROKE.event,
    "event → data table arrow matches the event",
  );
  assert.equal(
    strokeById.get("em-render-data-table-open-cohort-windows-trg-license-checkout-modal"),
    SOURCE_STROKE.dataTable,
    "data table → trigger arrow matches the data table",
  );
  for (const edge of apex.edges) {
    const flow = strokeById.get(edge.id);
    const kind = sourceType.get(edge.from);
    assert.equal(flow, kind ? SOURCE_STROKE[kind] : undefined, `${edge.id} should match its source`);
  }
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
    /dataTableMetaBelow[\s\S]*contextLabel[\s\S]*sticky-data-table-context/,
  );
  assert.doesNotMatch(
    stickySrc,
    /dataTableMetaBelow[\s\S]*sticky-data-table-context[\s\S]{0,240}d\.whoLabel/,
  );
  assert.match(stickySrc, /whoInHeader[\s\S]*kind === "automation"/);
  assert.match(cssSrc, /\.sticky-header\s*\{[^}]*gap:\s*0\.1rem/s);
  assert.match(cssSrc, /\.sticky-header\s*\{[^}]*margin-bottom:\s*0\.42rem/s);
  assert.match(cssSrc, /\.sticky-lane\s*\{[^}]*margin-top:\s*0\.4rem/s);
  assert.match(cssSrc, /\.sticky-header \.sticky-lane\s*\{[^}]*margin-top:\s*0/s);
  assert.match(cssSrc, /\.sticky\s*\{[^}]*padding:\s*0\.72rem 0\.8rem/s);
});

test("automations use the trigger card color and events stay yellow", () => {
  const cssSrc = readFileSync(join(here, "styles.css"), "utf8");
  const shared = cssSrc.match(/\.sticky\.trigger,\s*\.sticky\.automation\s*\{[^}]+\}/s)?.[0] ?? "";
  assert.match(shared, /#e7eef6/);
  assert.match(shared, /#c5d4e8/);
  assert.doesNotMatch(cssSrc, /#f7f1e4|#e7dcc6|#b08968/);
  assert.match(cssSrc, /\.sticky\.event\s*\{[^}]*#f8d04d/s);
  const canvasSrc = readFileSync(join(here, "BlueprintCanvas.tsx"), "utf8");
  assert.match(canvasSrc, /k === "trigger" \|\| k === "automation"/);
  assert.doesNotMatch(canvasSrc, /#e7dcc6/);
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
  // Location and For: prefix weak italic; value same weight, upright and full opacity.
  const forBlock = cssSrc.match(/\.sticky-data-table-context\s*\{[^}]+\}/s)?.[0] ?? "";
  const prefixBlock = cssSrc.match(/\.sticky-meta-prefix\s*\{[^}]+\}/s)?.[0] ?? "";
  const valueBlock = cssSrc.match(/\.sticky-meta-value\s*\{[^}]+\}/s)?.[0] ?? "";
  assert.match(triggerLocationBlock, /font-weight:\s*800/);
  assert.match(triggerLocationBlock, /font-style:\s*normal/);
  assert.match(triggerLocationBlock, /opacity:\s*1/);
  assert.match(forBlock, /font-weight:\s*800/);
  assert.match(forBlock, /font-style:\s*normal/);
  assert.match(prefixBlock, /font-weight:\s*500/);
  assert.match(prefixBlock, /font-style:\s*italic/);
  assert.match(prefixBlock, /opacity:\s*0\.62/);
  assert.match(valueBlock, /font-weight:\s*500/);
  assert.match(valueBlock, /font-style:\s*normal/);
  assert.match(stickySrc, /sticky-meta-prefix/);
  assert.match(stickySrc, /sticky-meta-value/);
  assert.match(stickySrc, /isTriggerUi \? "sticky-trigger-location" : "sticky-parents"/);
  assert.match(stickySrc, /isTriggerUi \? "sticky-parents" : "sticky-lane"/);
  assert.match(stickySrc, /whoBelowLine \? d\.laneLabel : undefined/);
  assert.match(
    stickySrc,
    /externalBelowLine[\s\S]*StickyFields fields=\{presentedFields\} label=\{TRIGGER_FIELD_GROUP_LABEL\.presented\}[\s\S]*StickyApiClientResponse/,
  );
  assert.doesNotMatch(stickySrc, /sticky-presented-line/);
  assert.match(stickySrc, /sticky-fields__name/);
  assert.match(stickySrc, /sticky-fields__type/);
  assert.match(stickySrc, /sticky-fields__info/);
  assert.match(stickySrc, /<summary>\{TRIGGER_FIELD_GROUP_LABEL\.collected\}<\/summary>/);
  assert.doesNotMatch(stickySrc, /API Client Response/);
  assert.match(stickySrc, /formatExternalLabel/);
  assert.match(
    stickySrc,
    /externalBelowLine \? \(\s*<div className="sticky-parents sticky-who-below-line">\{externalLabel\}<\/div>/,
  );
  assert.match(stickySrc, /sticky-who-below-line/);
  assert.match(
    stickySrc,
    /sticky-who-below-line[\s\S]*fieldGroups\.map/,
  );
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
    "webpage components",
  );
  assert.equal(
    formatParentsLabel(payButton.parents ?? []),
    "Location: License Purchase Page",
  );
});

test("trigger fields group as Data Presented, Data Collected, and Metadata", () => {
  assert.equal(formatTriggerFieldGroupLabel("presented"), "Data Presented");
  assert.equal(formatTriggerFieldGroupLabel("collected"), "Data Collected");
  assert.equal(formatTriggerFieldGroupLabel("metadata"), "Metadata");
  assert.deepEqual(
    groupTriggerFields([
      { name: "price_in_kobo", type: "integer", description: "Shown.", category: "presented" },
      { name: "email", type: "string", description: "Entered.", category: "collected" },
      { name: "user_id", type: "uuid", description: "Known.", category: "metadata" },
    ]).map((group) => group.label),
    ["Data Presented", "Data Collected", "Metadata"],
  );
  const stickySrc = readFileSync(join(here, "StickyNode.tsx"), "utf8");
  assert.match(stickySrc, /kind === "trigger"/);
  assert.match(stickySrc, /groupTriggerFields/);
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
    "webpage components",
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
    "componentInWebPage",
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
  assert.equal(UI_KIND_LUCIDE_ICONS.componentInWebPage, "MousePointer2");
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
    "Who: Authenticated Learner",
  );
  assert.equal(
    formatDataTableLaneLabel(apex, initiatedLicensePurchases.id),
    "For: Paystack Payment Initiator",
    "Initiated License Purchases Context is the automation that consumes it",
  );
  assert.equal(laneFor(subCharge.streamId), "Who: Authenticated Learner");
  assert.equal(automationActorLabel(subCharge.id, laneFor(subCharge.streamId)), undefined);

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
