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
  { id: "lane-subscriber", name: "Subscriber", band: "ui", order: 2 },
  { id: "lane-group-member", name: "Group member", band: "ui", order: 3 },
  { id: "lane-group-host", name: "Group host", band: "ui", order: 4 },
  { id: "lane-marketing-lead", name: "Marketing lead", band: "ui", order: 5 },
  { id: "lane-product-admin", name: "Product admin", band: "ui", order: 6 },
  { id: "lane-writes", name: "Commands", band: "commandView", order: 0 },
];

/** eventId → { cmdId, cmdName, slice } */
const COMMAND_FOR_EVENT = {
  "evt-device-imported": { cmdId: "cmd-import-device", cmdName: "Import Device", slice: "slice-ops" },
  "evt-device-registered": { cmdId: "cmd-register-device", cmdName: "Register Device", slice: "slice-auth" },
  "evt-device-revoked": { cmdId: "cmd-revoke-device", cmdName: "Revoke Device", slice: "slice-auth" },
  "evt-entitlement-imported": { cmdId: "cmd-import-entitlement", cmdName: "Import Entitlement", slice: "slice-ops" },
  "evt-trial-started": { cmdId: "cmd-start-trial", cmdName: "Start Trial", slice: "slice-auth" },
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
    cmdId: "cmd-redirect-to-success-page",
    cmdName: "Mark Customer Visit to Success Page",
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
    name: "Purchase License Page",
    lane: "lane-authenticated-learner",
    actor: "Authenticated Learner",
    slice: "slice-paystack-checkout",
    notes:
      "In-app payment page that hands the customer off to hosted Paystack checkout. Reconnects the Pay with Paystack Button path.",
    bindings: [
      {
        uiField: "transaction_id",
        target: {
          kind: "viewField",
          viewId: "view-paystack-checkout",
          field: "transaction_id",
        },
      },
      {
        uiField: "authorization_url",
        target: {
          kind: "viewField",
          viewId: "view-paystack-checkout",
          field: "authorization_url",
        },
      },
    ],
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
    observes: ["view-devices"],
    notes: "Accounts.register_device revokes the oldest device past the cap",
  },
  {
    id: "auto-paystack-webhook",
    name: "Paystack webhook",
    lane: "lane-subscriber",
    slice: "slice-billing",
    observes: ["view-payments"],
    notes: "POST /webhooks/paystack — translation into billing commands",
  },
  {
    id: "auto-monnify-webhook",
    name: "Monnify webhook",
    lane: "lane-subscriber",
    slice: "slice-billing",
    observes: ["view-payments"],
    notes: "POST /webhooks/monnify",
  },
  {
    id: "auto-billing-reconcile",
    name: "Billing reconcile",
    lane: "lane-subscriber",
    slice: "slice-billing",
    observes: ["view-payments"],
    notes: "Billing.reconcile_reference on return URL",
  },
  {
    id: "auto-billing-poll",
    name: "Billing poll",
    lane: "lane-subscriber",
    slice: "slice-billing",
    observes: ["view-entitlement"],
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

const VIEWS = [
  {
    id: "view-devices",
    name: "Devices",
    slice: "slice-auth",
    fedBy: ["evt-device-imported", "evt-device-registered", "evt-device-revoked"],
    rendersOn: ["scr-settings-devices", "scr-mobile-settings"],
  },
  {
    id: "view-entitlement",
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
    id: "view-payments",
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
    id: "view-paystack-checkout",
    name: "Initiated Transactions",
    slice: "slice-paystack-checkout",
    fedBy: ["evt-single-charge-initiated"],
    rendersOn: ["scr-payment-page"],
    fields: [
      {
        name: "transaction_id",
        type: "string",
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
    id: "view-attempts",
    name: "Attempts",
    slice: "slice-exam",
    fedBy: ["evt-exam-submitted"],
    rendersOn: ["scr-me-hub", "scr-joint-exam", "scr-mobile-practice"],
  },
  {
    id: "view-interview-session",
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
    id: "view-interview-review",
    name: "Interview Review",
    slice: "slice-interview",
    fedBy: ["evt-interview-scored"],
    rendersOn: ["scr-interview"],
  },
  {
    id: "view-groups",
    name: "Study Groups",
    slice: "slice-groups",
    fedBy: ["evt-group-created", "evt-group-settings-updated", "evt-join-code-set"],
    rendersOn: ["scr-study-group", "scr-mobile-study-groups"],
  },
  {
    id: "view-memberships",
    name: "Memberships",
    slice: "slice-groups",
    fedBy: ["evt-member-joined", "evt-member-left"],
    rendersOn: ["scr-study-group", "scr-join-group", "scr-mobile-join-group"],
  },
  {
    id: "view-joint-sessions",
    name: "Joint Sessions",
    slice: "slice-groups",
    fedBy: ["evt-joint-opened", "evt-joint-closed"],
    rendersOn: ["scr-study-group", "scr-joint-exam", "scr-mobile-study-groups"],
  },
  {
    id: "view-flags",
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
  ["trg-pay-with-paystack", "cmd-initiate-single-charge"],
  ["trg-success-page", "cmd-redirect-to-success-page"],
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
  type: "string",
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
      "User email from the Pay with Paystack Button. Paystack initialize requires the customer's email.",
  },
  {
    name: "amount",
    type: "number",
    description: "Amount to be paid in kobo, from the Pay with Paystack Button.",
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

const commands = Object.entries(COMMAND_FOR_EVENT).map(([evtId, meta]) => ({
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
  ...(meta.cmdId === "cmd-redirect-to-success-page"
    ? {
        notes: "Records that the customer visited the Paystack payment success page.",
      }
    : {}),
}));

const triggers = [
  {
    type: "trigger",
    id: "trg-pay-with-paystack",
    name: "Pay with Paystack Button",
    streamId: "lane-authenticated-learner",
    sliceId: "slice-billing",
    actor: "Subscriber",
    parents: ["Purchase License Page"],
    fields: [
      {
        name: "email",
        type: "string",
        description:
          "The user's email for the person paying with this button. Paystack requires email.",
      },
      {
        name: "amount",
        type: "number",
        description: "The amount to be paid, in kobo.",
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
      "EXTERNAL — Hosted Paystack checkout outside the product. Customer pays here before returning to success or cancel.",
  },
  {
    type: "trigger",
    id: "trg-success-page",
    name: "Paystack Payment Success Page",
    streamId: "lane-authenticated-learner",
    sliceId: "slice-paystack-checkout",
    actor: "Authenticated Learner",
    notes:
      "In-app success return after Paystack checkout; issues Mark Customer Visit to Success Page.",
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

const views = VIEWS.map((v) => ({
  type: "view",
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
    id: `em-produce-${meta.cmdId}`,
    from: meta.cmdId,
    to: evtId,
    rel: "produces",
  });
}
for (const v of VIEWS) {
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
  id: "em-redirect-trg-paystack-checkout-trg-success-page",
  from: "trg-paystack-checkout",
  to: "trg-success-page",
  rel: "redirectsTo",
});

const streamEdges = doc.edges.filter((e) => e.rel === "ordersBefore" || e.rel === "loopsBack");

doc.meta.modelVersion = 10;
doc.meta.name = "Apex Bee — EventStore streams + timeline stack";
doc.streams = [...EXTRA_STREAMS, ...doc.streams.filter((s) => s.band === "events")];
doc.nodes = [...events, ...commands, ...views, ...screens, ...triggers, ...automations];
doc.edges = [...streamEdges, ...emEdges];

writeFileSync(path, `${JSON.stringify(doc, null, 2)}\n`);
console.log(
  `Updated ${path}: ${commands.length} commands, ${views.length} views, ${screens.length} screens, ${automations.length} automations, ${emEdges.length} EM edges`,
);
