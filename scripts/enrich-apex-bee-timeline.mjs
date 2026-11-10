#!/usr/bin/env node
/**
 * One-shot enricher: adds commands, screens, and EM edges to samples/apex-bee.json.
 * Run: node scripts/enrich-apex-bee-timeline.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const path = join(here, "../samples/apex-bee.json");

const doc = JSON.parse(readFileSync(path, "utf8"));

const EXTRA_STREAMS = [
  { id: "lane-visitor", name: "Visitor", band: "ui", order: 0 },
  { id: "lane-authenticated-learner", name: "Authenticated Learner", band: "ui", order: 1 },
  { id: "lane-license-purchase-process-manager", name: "License Purchase Process Manager", band: "ui", order: 2 },
  { id: "lane-subscriber", name: "Subscriber", band: "ui", order: 3 },
  { id: "lane-group-member", name: "Group member", band: "ui", order: 4 },
  { id: "lane-group-host", name: "Group host", band: "ui", order: 5 },
  { id: "lane-marketing-lead", name: "Marketing lead", band: "ui", order: 6 },
  { id: "lane-product-admin", name: "Product admin", band: "ui", order: 7 },
  { id: "lane-writes", name: "Commands", band: "commandView", order: 0 },
];

/** eventId → { cmdId, cmdName, slice } */
const COMMAND_FOR_EVENT = {
  "evt-device-imported": { cmdId: "cmd-import-device", cmdName: "Import Device", slice: "slice-ops" },
  "evt-device-registered": { cmdId: "cmd-register-device", cmdName: "Register Device", slice: "slice-auth" },
  "evt-device-revoked": { cmdId: "cmd-revoke-device", cmdName: "Revoke Device", slice: "slice-auth" },
  "evt-entitlement-imported": { cmdId: "cmd-import-entitlement", cmdName: "Import Entitlement", slice: "slice-ops" },
  "evt-trial-started": { cmdId: "cmd-start-trial", cmdName: "Start Trial", slice: "slice-auth" },
  "evt-license-purchase-initiated": {
    cmdId: "cmd-initiate-license-purchase",
    cmdName: "Initiate License Purchase",
    slice: "slice-billing",
  },
  "evt-subscription-activated": {
    cmdId: "cmd-activate-subscription",
    cmdName: "Activate Subscription",
    slice: "slice-billing",
  },
  "evt-subscription-updated": {
    cmdId: "cmd-update-subscription",
    cmdName: "Update Subscription",
    slice: "slice-billing",
  },
  "evt-subscription-cancelled": {
    cmdId: "cmd-cancel-subscription",
    cmdName: "Cancel Subscription",
    slice: "slice-billing",
  },
  "evt-payment-initiated": { cmdId: "cmd-initiate-payment", cmdName: "Initiate Payment", slice: "slice-billing" },
  "evt-single-charge-initiated": {
    cmdId: "cmd-initiate-single-charge",
    cmdName: "Initiate Single Charge",
    slice: "slice-billing",
  },
  "evt-customer-redirected-to-success": {
    cmdId: "cmd-record-customer-redirect-success",
    cmdName: "Record Customer Redirect From Checkout Page To Success URL",
    slice: "slice-billing",
  },
  "evt-customer-redirected-to-cancel": {
    cmdId: "cmd-record-customer-redirect-failure",
    cmdName: "Record Customer Redirect From Checkout Page To Cancel URL",
    slice: "slice-billing",
  },
  "evt-payment-confirmed": { cmdId: "cmd-confirm-payment", cmdName: "Confirm Payment", slice: "slice-billing" },
  "evt-payment-imported": { cmdId: "cmd-import-payment", cmdName: "Import Payment", slice: "slice-billing" },
  "evt-manual-payment": {
    cmdId: "cmd-record-manual-payment",
    cmdName: "Record Manual Payment",
    slice: "slice-billing",
  },
  "evt-exam-submitted": { cmdId: "cmd-submit-exam", cmdName: "Submit Exam", slice: "slice-exam" },
  "evt-interview-started": {
    cmdId: "cmd-start-interview-session",
    cmdName: "Start Session",
    slice: "slice-interview",
  },
  "evt-interview-scored": { cmdId: "cmd-score-interview-answer", cmdName: "Score Answer", slice: "slice-interview" },
  "evt-interview-advanced": {
    cmdId: "cmd-advance-interview-question",
    cmdName: "Advance Question",
    slice: "slice-interview",
  },
  "evt-interview-finished": {
    cmdId: "cmd-finish-interview-session",
    cmdName: "Finish Session",
    slice: "slice-interview",
  },
  "evt-interview-abandoned": {
    cmdId: "cmd-abandon-interview-session",
    cmdName: "Abandon Session",
    slice: "slice-interview",
  },
  "evt-group-created": { cmdId: "cmd-create-group", cmdName: "Create Group", slice: "slice-ops" },
  "evt-join-code-set": { cmdId: "cmd-set-join-code", cmdName: "Set Join Code", slice: "slice-groups" },
  "evt-member-joined": { cmdId: "cmd-join-group", cmdName: "Join Group", slice: "slice-groups" },
  "evt-member-left": { cmdId: "cmd-leave-group", cmdName: "Leave Group", slice: "slice-groups" },
  "evt-group-settings-updated": {
    cmdId: "cmd-update-group-settings",
    cmdName: "Update Group Settings",
    slice: "slice-ops",
  },
  "evt-joint-opened": { cmdId: "cmd-open-joint-exam", cmdName: "Open Joint Exam", slice: "slice-groups" },
  "evt-joint-closed": { cmdId: "cmd-close-joint-exam", cmdName: "Close Joint Exam", slice: "slice-groups" },
  "evt-flag-imported": { cmdId: "cmd-import-flag", cmdName: "Import Flag", slice: "slice-ops" },
  "evt-flag-raised": { cmdId: "cmd-raise-flag", cmdName: "Raise Flag", slice: "slice-trust" },
  "evt-flag-resolved": { cmdId: "cmd-resolve-flag", cmdName: "Resolve Flag", slice: "slice-trust" },
};

const EVENT_SLICE = Object.fromEntries(
  Object.entries(COMMAND_FOR_EVENT).map(([evt, { slice }]) => [evt, slice]),
);

const SCREENS = [
  {
    id: "scr-auth-google",
    name: "Google sign-in",
    lane: "lane-visitor",
    actor: "Visitor",
    slice: "slice-auth",
    notes: "GET /auth/google/callback — AuthController",
  },
  {
    id: "scr-mobile-auth",
    name: "Mobile sign-in",
    lane: "lane-visitor",
    actor: "Visitor",
    slice: "slice-auth",
    notes: "POST /api/mobile/v1/auth/google|guest",
  },
  {
    id: "scr-settings-devices",
    name: "Settings · devices",
    lane: "lane-authenticated-learner",
    actor: "Authenticated Learner",
    slice: "slice-auth",
    notes: "SettingsLive revoke_device",
  },
  {
    id: "scr-mobile-settings",
    name: "Mobile · devices",
    lane: "lane-authenticated-learner",
    actor: "Authenticated Learner",
    slice: "slice-auth",
    notes: "DELETE /api/mobile/v1/devices/:token",
  },
  {
    id: "scr-subscription",
    name: "Subscription checkout",
    lane: "lane-subscriber",
    actor: "Subscriber",
    slice: "slice-billing",
    notes: "/settings/subscription — start_checkout, cancel",
  },
  {
    id: "scr-payment-page",
    name: "License Purchase Page",
    lane: "lane-authenticated-learner",
    actor: "Authenticated Learner",
    slice: "slice-paystack-checkout",
    notes:
      "In-app payment page that hands the customer off to hosted Paystack checkout. Reconnects the License Checkout Modal path.",
    bindings: [
      {
        uiField: "transaction_id",
        target: {
          kind: "dataTableField",
          dataTableId: "data-table-paystack-checkout",
          field: "transaction_id",
        },
      },
      {
        uiField: "authorization_url",
        target: {
          kind: "dataTableField",
          dataTableId: "data-table-paystack-checkout",
          field: "authorization_url",
        },
      },
    ],
  },
  {
    id: "scr-transaction-status",
    name: "Transaction Status Page",
    lane: "lane-authenticated-learner",
    actor: "Authenticated Learner",
    slice: "slice-paystack-checkout",
    notes:
      "In-app landing page after Paystack auto-redirect URLs. Stands alone — does not issue a command.",
  },
  {
    id: "scr-pay-return",
    name: "Payment return",
    lane: "lane-subscriber",
    actor: "Subscriber",
    slice: "slice-billing",
    notes: "/pay/return — activate_after_checkout",
  },
  {
    id: "scr-mobile-billing",
    name: "Mobile billing",
    lane: "lane-subscriber",
    actor: "Subscriber",
    slice: "slice-billing",
    notes: "/api/mobile/v1/billing/*",
  },
  {
    id: "scr-sys-grant-manual",
    name: "Manual payment (ops)",
    lane: "lane-product-admin",
    actor: "Product admin",
    slice: "slice-billing",
    notes: "Billing.grant_manual — IEx/scripts",
  },
  {
    id: "scr-me-hub",
    name: "Practice hub",
    lane: "lane-authenticated-learner",
    actor: "Authenticated Learner",
    slice: "slice-exam",
    notes: "/me/:slug — exam submit, flag during drill/exam",
  },
  {
    id: "scr-joint-exam",
    name: "Joint exam",
    lane: "lane-group-member",
    actor: "Group member",
    slice: "slice-exam",
    notes: "/study-groups/:id/take/:sid",
  },
  {
    id: "scr-mobile-practice",
    name: "Mobile practice",
    lane: "lane-authenticated-learner",
    actor: "Authenticated Learner",
    slice: "slice-exam",
    notes: "POST /api/mobile/v1/exams/submit, /questions/flag",
  },
  {
    id: "scr-interview",
    name: "Interview drill",
    lane: "lane-authenticated-learner",
    actor: "Authenticated Learner",
    slice: "slice-interview",
    notes: "/interview — MeLive interview flow (web only)",
  },
  {
    id: "scr-study-group",
    name: "Study group admin",
    lane: "lane-group-host",
    actor: "Group host",
    slice: "slice-groups",
    notes: "/study-groups/:id — invite, joint exam open/close",
  },
  {
    id: "scr-join-group",
    name: "Join study group",
    lane: "lane-group-member",
    actor: "Group member",
    slice: "slice-groups",
    notes: "/study-groups/join/:code",
  },
  {
    id: "scr-mobile-join-group",
    name: "Mobile · join group",
    lane: "lane-group-member",
    actor: "Group member",
    slice: "slice-groups",
    notes: "POST /api/mobile/v1/study-groups/join",
  },
  {
    id: "scr-mobile-study-groups",
    name: "Mobile · group host",
    lane: "lane-group-host",
    actor: "Group host",
    slice: "slice-groups",
    notes: "/api/mobile/v1/study-groups/* — invite, joint exam",
  },
  {
    id: "scr-settings-admin",
    name: "Settings · admin",
    lane: "lane-product-admin",
    actor: "Product admin",
    slice: "slice-trust",
    notes: "/settings/admin — resolve_flag",
  },
];

/** Processors (gear). Same lanes as the user category they serve. */
const AUTOMATIONS = [
  {
    id: "auto-device-cap",
    name: "Device cap",
    lane: "lane-visitor",
    slice: "slice-auth",
    observes: ["data-table-devices"],
    notes: "Accounts.register_device revokes the oldest device past the cap",
  },
  {
    id: "auto-subscription-charge",
    name: "Trigger Paystack Payment",
    lane: "lane-license-purchase-process-manager",
    slice: "slice-billing",
    observes: ["data-table-initiated-license-purchases"],
    notes:
      "Watches Initiated License Purchases and issues Initiate Single Charge to start Paystack checkout",
  },
  {
    id: "auto-paystack-webhook",
    name: "Paystack webhook",
    lane: "lane-subscriber",
    slice: "slice-billing",
    observes: ["data-table-payments"],
    notes: "POST /webhooks/paystack — translation into billing commands",
  },
  {
    id: "auto-monnify-webhook",
    name: "Monnify webhook",
    lane: "lane-subscriber",
    slice: "slice-billing",
    observes: ["data-table-payments"],
    notes: "POST /webhooks/monnify",
  },
  {
    id: "auto-billing-reconcile",
    name: "Billing reconcile",
    lane: "lane-subscriber",
    slice: "slice-billing",
    observes: ["data-table-payments"],
    notes: "Billing.reconcile_reference on return URL",
  },
  {
    id: "auto-billing-poll",
    name: "Billing poll",
    lane: "lane-subscriber",
    slice: "slice-billing",
    observes: ["data-table-entitlement"],
    notes: "Billing.Poller every 24h — poll_all, Monnify renewals",
  },
  {
    id: "auto-ops-migration",
    name: "Ops migration",
    lane: "lane-product-admin",
    slice: "slice-ops",
    observes: [],
    notes: "IEx: seed groups, imports, group settings rename",
  },
];

const DATA_TABLES = [
  {
    id: "data-table-devices",
    name: "Devices",
    slice: "slice-auth",
    fedBy: ["evt-device-imported", "evt-device-registered", "evt-device-revoked"],
    rendersOn: ["scr-settings-devices", "scr-mobile-settings"],
  },
  {
    id: "data-table-entitlement",
    name: "Entitlement",
    slice: "slice-billing",
    fedBy: [
      "evt-entitlement-imported",
      "evt-trial-started",
      "evt-subscription-activated",
      "evt-subscription-updated",
      "evt-subscription-cancelled",
    ],
    rendersOn: ["scr-subscription", "scr-mobile-billing"],
  },
  {
    id: "data-table-initiated-license-purchases",
    name: "Initiated License Purchases",
    slice: "slice-billing",
    fedBy: ["evt-license-purchase-initiated"],
    rendersOn: [],
  },
  {
    id: "data-table-payments",
    name: "Payments",
    slice: "slice-billing",
    fedBy: [
      "evt-payment-initiated",
      "evt-payment-confirmed",
      "evt-payment-imported",
      "evt-manual-payment",
    ],
    rendersOn: ["scr-subscription", "scr-pay-return", "scr-mobile-billing"],
  },
  {
    id: "data-table-open-cohort-windows",
    name: "Open Cohort Windows",
    slice: "slice-available-license-cards",
    fedBy: ["evt-cohort-window-opened"],
    rendersOn: ["trg-available-license-cards", "trg-license-checkout-modal"],
    fields: [
      {
        name: "cohort_window_id",
        type: "uuid",
        optional: false,
        source: {
          kind: "fromEvent",
          eventId: "evt-cohort-window-opened",
          field: "cohort_window_id",
        },
      },
      {
        name: "name",
        type: "string",
        optional: false,
        source: {
          kind: "fromEvent",
          eventId: "evt-cohort-window-opened",
          field: "name",
        },
      },
      {
        name: "price",
        type: "integer",
        optional: false,
        source: {
          kind: "fromEvent",
          eventId: "evt-cohort-window-opened",
          field: "price",
        },
      },
    ],
  },
  {
    id: "data-table-paystack-checkout",
    name: "Initiated Transactions",
    slice: "slice-paystack-checkout",
    fedBy: ["evt-single-charge-initiated"],
    rendersOn: ["scr-payment-page"],
    fields: [
      {
        name: "transaction_id",
        type: "uuid",
        optional: false,
        source: {
          kind: "fromEvent",
          eventId: "evt-single-charge-initiated",
          field: "transaction_id",
        },
      },
      {
        name: "authorization_url",
        type: "string",
        optional: false,
        source: {
          kind: "fromEvent",
          eventId: "evt-single-charge-initiated",
          field: "authorization_url",
        },
      },
    ],
  },
  {
    id: "data-table-attempts",
    name: "Attempts",
    slice: "slice-exam",
    fedBy: ["evt-exam-submitted"],
    rendersOn: ["scr-me-hub", "scr-joint-exam", "scr-mobile-practice"],
  },
  {
    id: "data-table-interview-session",
    name: "Interview Session",
    slice: "slice-interview",
    fedBy: [
      "evt-interview-started",
      "evt-interview-scored",
      "evt-interview-advanced",
      "evt-interview-finished",
      "evt-interview-abandoned",
    ],
    rendersOn: ["scr-interview"],
  },
  {
    id: "data-table-interview-review",
    name: "Interview Review",
    slice: "slice-interview",
    fedBy: ["evt-interview-scored"],
    rendersOn: ["scr-interview"],
  },
  {
    id: "data-table-groups",
    name: "Study Groups",
    slice: "slice-groups",
    fedBy: ["evt-group-created", "evt-group-settings-updated", "evt-join-code-set"],
    rendersOn: ["scr-study-group", "scr-mobile-study-groups"],
  },
  {
    id: "data-table-memberships",
    name: "Memberships",
    slice: "slice-groups",
    fedBy: ["evt-member-joined", "evt-member-left"],
    rendersOn: ["scr-study-group", "scr-join-group", "scr-mobile-join-group"],
  },
  {
    id: "data-table-joint-sessions",
    name: "Joint Sessions",
    slice: "slice-groups",
    fedBy: ["evt-joint-opened", "evt-joint-closed"],
    rendersOn: ["scr-study-group", "scr-joint-exam", "scr-mobile-study-groups"],
  },
  {
    id: "data-table-flags",
    name: "Question Flags",
    slice: "slice-trust",
    fedBy: ["evt-flag-imported", "evt-flag-raised", "evt-flag-resolved"],
    rendersOn: ["scr-me-hub", "scr-mobile-practice", "scr-settings-admin"],
  },
];

/** [screenId, cmdId] */
const ISSUES = [
  ["scr-auth-google", "cmd-register-device"],
  ["scr-auth-google", "cmd-start-trial"],
  ["scr-mobile-auth", "cmd-register-device"],
  ["scr-mobile-auth", "cmd-start-trial"],
  ["scr-settings-devices", "cmd-revoke-device"],
  ["scr-mobile-settings", "cmd-revoke-device"],
  ["auto-device-cap", "cmd-revoke-device"],
  ["scr-subscription", "cmd-initiate-payment"],
  ["scr-subscription", "cmd-cancel-subscription"],
  ["trg-license-checkout-modal", "cmd-initiate-license-purchase"],
  ["auto-subscription-charge", "cmd-initiate-single-charge"],
  ["trg-auto-redirect-success", "cmd-record-customer-redirect-success"],
  ["trg-auto-redirect-failure", "cmd-record-customer-redirect-failure"],
  ["scr-mobile-billing", "cmd-initiate-payment"],
  ["scr-mobile-billing", "cmd-cancel-subscription"],
  ["scr-mobile-billing", "cmd-activate-subscription"],
  ["scr-pay-return", "cmd-activate-subscription"],
  ["auto-paystack-webhook", "cmd-confirm-payment"],
  ["auto-paystack-webhook", "cmd-import-payment"],
  ["auto-paystack-webhook", "cmd-activate-subscription"],
  ["auto-paystack-webhook", "cmd-update-subscription"],
  ["auto-paystack-webhook", "cmd-cancel-subscription"],
  ["auto-monnify-webhook", "cmd-confirm-payment"],
  ["auto-monnify-webhook", "cmd-import-payment"],
  ["auto-monnify-webhook", "cmd-activate-subscription"],
  ["auto-monnify-webhook", "cmd-update-subscription"],
  ["auto-monnify-webhook", "cmd-cancel-subscription"],
  ["auto-billing-reconcile", "cmd-confirm-payment"],
  ["auto-billing-reconcile", "cmd-import-payment"],
  ["auto-billing-reconcile", "cmd-activate-subscription"],
  ["auto-billing-poll", "cmd-initiate-payment"],
  ["auto-billing-poll", "cmd-update-subscription"],
  ["scr-sys-grant-manual", "cmd-record-manual-payment"],
  ["scr-sys-grant-manual", "cmd-activate-subscription"],
  ["scr-sys-grant-manual", "cmd-update-subscription"],
  ["scr-me-hub", "cmd-submit-exam"],
  ["scr-me-hub", "cmd-raise-flag"],
  ["scr-joint-exam", "cmd-submit-exam"],
  ["scr-mobile-practice", "cmd-submit-exam"],
  ["scr-mobile-practice", "cmd-raise-flag"],
  ["scr-interview", "cmd-start-interview-session"],
  ["scr-interview", "cmd-score-interview-answer"],
  ["scr-interview", "cmd-advance-interview-question"],
  ["scr-interview", "cmd-finish-interview-session"],
  ["scr-interview", "cmd-abandon-interview-session"],
  ["scr-study-group", "cmd-set-join-code"],
  ["scr-study-group", "cmd-open-joint-exam"],
  ["scr-study-group", "cmd-close-joint-exam"],
  ["scr-join-group", "cmd-join-group"],
  ["scr-mobile-join-group", "cmd-join-group"],
  ["scr-mobile-study-groups", "cmd-set-join-code"],
  ["scr-mobile-study-groups", "cmd-open-joint-exam"],
  ["scr-mobile-study-groups", "cmd-close-joint-exam"],
  ["scr-settings-admin", "cmd-resolve-flag"],
  ["auto-ops-migration", "cmd-import-device"],
  ["auto-ops-migration", "cmd-import-entitlement"],
  ["auto-ops-migration", "cmd-import-payment"],
  ["auto-ops-migration", "cmd-import-flag"],
  ["auto-ops-migration", "cmd-create-group"],
  ["auto-ops-migration", "cmd-update-group-settings"],
];

const SINGLE_CHARGE_TRANSACTION_ID_FIELD = {
  name: "transaction_id",
  type: "uuid",
  description: "Transaction ID for this charge. Source TBD.",
};

const events = doc.nodes.filter((n) => n.type === "event");
for (const e of events) {
  if (EVENT_SLICE[e.id]) e.sliceId = EVENT_SLICE[e.id];
  if (e.id === "evt-single-charge-initiated") {
    e.fields = Array.isArray(e.fields) ? e.fields : [];
    e.fields = e.fields.filter((f) => f.name !== "transaction_id");
    e.fields.unshift(SINGLE_CHARGE_TRANSACTION_ID_FIELD);
  }
}

const INITIATE_SINGLE_CHARGE_FIELDS = [
  {
    name: "email",
    type: "string",
    description:
      "User email for Paystack initialize (customer email required by Paystack).",
  },
  {
    name: "amount",
    type: "number",
    description: "Amount to be paid in kobo for Paystack initialize.",
  },
];

const INITIATE_SINGLE_CHARGE_API = [
  {
    label: "Success",
    fields: [
      {
        name: "status",
        type: "boolean",
        description:
          "Paystack POST /transaction/initialize succeeded (true). This is the API call, not whether the customer paid.",
      },
      {
        name: "message",
        type: "string",
        description:
          'Paystack message for a successful initialize. Sample: "Authorization URL created".',
      },
      {
        name: "data.authorization_url",
        type: "string",
        description: "Hosted checkout URL from data.authorization_url. The customer is sent here.",
      },
      {
        name: "data.access_code",
        type: "string",
        description: "Checkout access code from data.access_code.",
      },
      {
        name: "data.reference",
        type: "string",
        description:
          "Transaction reference from data.reference. Later verify and webhooks use this. Populates SingleChargeInitiated.",
      },
    ],
  },
  {
    label: "Error",
    fields: [
      {
        name: "status",
        type: "boolean",
        description: "Paystack request failed (false).",
      },
      {
        name: "message",
        type: "string",
        description:
          'Brief description of the error. Examples: "Invalid Amount Sent", "Email Address is required", "Invalid key".',
      },
      {
        name: "type",
        type: "string",
        description:
          "Error category from Paystack: api_error, validation_error, or processor_error.",
      },
      {
        name: "code",
        type: "string",
        description:
          "Paystack-defined error code that categorizes the failure (e.g. missing_params).",
      },
      {
        name: "meta.nextStep",
        type: "string",
        description: "Suggested action to resolve the issue from the error meta object.",
      },
    ],
  },
];

/** One command node per cmdId; multiple events may share a command (merged produces). */
const commandsById = new Map();
for (const [evtId, meta] of Object.entries(COMMAND_FOR_EVENT)) {
  const existing = commandsById.get(meta.cmdId);
  if (existing) {
    if (!existing.produces.includes(evtId)) existing.produces.push(evtId);
    continue;
  }
  commandsById.set(meta.cmdId, {
    type: "command",
    id: meta.cmdId,
    name: meta.cmdName,
    streamId: "lane-writes",
    sliceId: meta.slice,
    input:
      meta.cmdId === "cmd-initiate-single-charge"
        ? [
            { name: "email", type: "string", optional: false, source: { kind: "user" } },
            { name: "amount", type: "number", optional: false, source: { kind: "user" } },
          ]
        : meta.cmdId === "cmd-initiate-license-purchase"
          ? [
              { name: "user_id", type: "uuid", optional: false, source: { kind: "user" } },
              {
                name: "cohort_window_id",
                type: "uuid",
                optional: false,
                source: { kind: "user" },
              },
            ]
          : [],
    produces: [evtId],
    rejections: [],
    ...(evtId === "evt-member-left"
      ? { notes: "Command exists; no product UI wired yet (LeaveGroup)" }
      : {}),
    ...(meta.cmdId === "cmd-initiate-single-charge"
      ? {
          fields: INITIATE_SINGLE_CHARGE_FIELDS,
          apiClientResponse: INITIATE_SINGLE_CHARGE_API,
        }
      : {}),
    ...(meta.cmdId === "cmd-initiate-license-purchase"
      ? {
          fields: [
            {
              name: "user_id",
              type: "uuid",
              description: "User ID of the learner initiating the license purchase.",
            },
            {
              name: "cohort_window_id",
              type: "uuid",
              description: "Cohort window ID for the license being purchased.",
            },
          ],
        }
      : {}),
    ...(meta.cmdId === "cmd-record-customer-redirect-success"
      ? {
          notes:
            "Issued from the Success Auto-Redirect URL after Paystack checkout. Produces Customer Redirected From Checkout Page To Success URL.",
        }
      : {}),
    ...(meta.cmdId === "cmd-record-customer-redirect-failure"
      ? {
          notes:
            "Issued from the Failure Auto-Redirect URL after Paystack checkout. Produces Customer Redirected From Checkout Page To Cancel URL.",
        }
      : {}),
  });
}
const commands = [...commandsById.values()];

const triggers = [
  {
    type: "trigger",
    id: "trg-license-checkout-modal",
    name: "License Checkout Modal",
    streamId: "lane-authenticated-learner",
    sliceId: "slice-billing",
    actor: "Subscriber",
    parents: ["License Purchase Page"],
    fields: [
      {
        name: "cohort_window_id",
        type: "uuid",
        description: "ID of the cohort window being checked out.",
      },
      {
        name: "name",
        type: "string",
        description: "Display name of the cohort window.",
      },
      {
        name: "price",
        type: "integer",
        description: "Price in cobalt for licenses in this cohort window.",
      },
    ],
  },
  {
    type: "trigger",
    id: "trg-available-license-cards",
    name: "Available License Cards",
    streamId: "lane-authenticated-learner",
    sliceId: "slice-available-license-cards",
    actor: "Subscriber",
    parents: ["License Purchase Page"],
    fields: [
      {
        name: "cohort_window_id",
        type: "uuid",
        description: "ID of the open cohort window shown on this card.",
      },
      {
        name: "name",
        type: "string",
        description: "Display name of the open cohort window.",
      },
      {
        name: "price",
        type: "integer",
        description: "Price in cobalt for licenses in this cohort window.",
      },
    ],
  },
  {
    type: "trigger",
    id: "trg-paystack-checkout",
    name: "Paystack Checkout Page",
    streamId: "lane-authenticated-learner",
    sliceId: "slice-paystack-checkout",
    actor: "Authenticated Learner",
    external: true,
    notes:
      "EXTERNAL — Hosted Paystack checkout outside the product. Customer pays here, then hits a success or failure auto-redirect URL.",
  },
  {
    type: "trigger",
    id: "trg-auto-redirect-success",
    name: "Success Auto-Redirect URL",
    streamId: "lane-authenticated-learner",
    sliceId: "slice-paystack-checkout",
    actor: "Authenticated Learner",
    autoRedirect: true,
    notes:
      "Paystack success return URL. Issues Record Customer Redirect From Checkout Page To Success URL, then redirects to the Transaction Status Page.",
  },
  {
    type: "trigger",
    id: "trg-auto-redirect-failure",
    name: "Failure Auto-Redirect URL",
    streamId: "lane-authenticated-learner",
    sliceId: "slice-paystack-checkout",
    actor: "Authenticated Learner",
    autoRedirect: true,
    notes:
      "Paystack failure/cancel return URL. Issues Record Customer Redirect From Checkout Page To Cancel URL, then redirects to the Transaction Status Page.",
  },
];

const automations = AUTOMATIONS.map((a) => ({
  type: "automation",
  id: a.id,
  name: a.name,
  streamId: a.lane,
  sliceId: a.slice,
  observes: a.observes,
  notes: a.notes,
}));

const dataTables = DATA_TABLES.map((v) => ({
  type: "dataTable",
  id: v.id,
  name: v.name,
  streamId: "lane-writes",
  sliceId: v.slice,
  fields: v.fields ?? [],
  fedBy: v.fedBy,
}));

const screens = SCREENS.map((s) => {
  const node = {
    type: "screen",
    id: s.id,
    name: s.name,
    streamId: s.lane,
    sliceId: s.slice,
    actor: s.actor,
    bindings: s.bindings ?? [],
  };
  if (s.notes) node.notes = s.notes;
  return node;
});

const emEdges = [];
let ei = 0;
for (const [from, to] of ISSUES) {
  emEdges.push({ id: `em-issue-${ei++}`, from, to, rel: "issues" });
}
for (const [evtId, meta] of Object.entries(COMMAND_FOR_EVENT)) {
  emEdges.push({
    id: `em-produce-${meta.cmdId}-${evtId}`,
    from: meta.cmdId,
    to: evtId,
    rel: "produces",
  });
}
for (const v of DATA_TABLES) {
  for (const evtId of v.fedBy) {
    emEdges.push({
      id: `em-update-${v.id}-${evtId}`,
      from: evtId,
      to: v.id,
      rel: "updates",
    });
  }
  for (const screenId of v.rendersOn) {
    emEdges.push({
      id: `em-render-${v.id}-${screenId}`,
      from: v.id,
      to: screenId,
      rel: "rendersOn",
    });
  }
}

emEdges.push({
  id: "em-redirect-scr-payment-page-trg-paystack-checkout",
  from: "scr-payment-page",
  to: "trg-paystack-checkout",
  rel: "redirectsTo",
});
emEdges.push({
  id: "em-redirect-trg-paystack-checkout-trg-auto-redirect-success",
  from: "trg-paystack-checkout",
  to: "trg-auto-redirect-success",
  rel: "redirectsTo",
});
emEdges.push({
  id: "em-redirect-trg-paystack-checkout-trg-auto-redirect-failure",
  from: "trg-paystack-checkout",
  to: "trg-auto-redirect-failure",
  rel: "redirectsTo",
});
emEdges.push({
  id: "em-redirect-trg-auto-redirect-success-scr-transaction-status",
  from: "trg-auto-redirect-success",
  to: "scr-transaction-status",
  rel: "redirectsTo",
});
emEdges.push({
  id: "em-redirect-trg-auto-redirect-failure-scr-transaction-status",
  from: "trg-auto-redirect-failure",
  to: "scr-transaction-status",
  rel: "redirectsTo",
});
emEdges.push({
  id: "em-observe-data-table-initiated-license-purchases-auto-subscription-charge",
  from: "data-table-initiated-license-purchases",
  to: "auto-subscription-charge",
  rel: "observes",
});

const streamEdges = doc.edges.filter((e) => e.rel === "ordersBefore" || e.rel === "loopsBack");

doc.meta.modelVersion = 10;
doc.meta.name = "Apex Bee — EventStore streams + timeline stack";
doc.streams = [...EXTRA_STREAMS, ...doc.streams.filter((s) => s.band === "events")];
doc.nodes = [...events, ...commands, ...dataTables, ...screens, ...triggers, ...automations];
doc.edges = [...streamEdges, ...emEdges];

writeFileSync(path, `${JSON.stringify(doc, null, 2)}\n`);
console.log(
  `Updated ${path}: ${commands.length} commands, ${dataTables.length} data tables, ${screens.length} screens, ${automations.length} automations, ${emEdges.length} EM edges`,
);
