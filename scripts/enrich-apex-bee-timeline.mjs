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

const EXTRA_SWIMLANES = [
  { id: "lane-web", name: "Web", band: "ui", order: 0 },
  { id: "lane-mobile", name: "Mobile app", band: "ui", order: 1 },
  { id: "lane-ops-ui", name: "Ops & system", band: "ui", order: 2 },
  { id: "lane-writes", name: "Commands", band: "commandView", order: 0 },
];

/** eventId → { cmdId, cmdName, slice } */
const COMMAND_FOR_EVENT = {
  "evt-device-imported": { cmdId: "cmd-import-device", cmdName: "ImportDevice", slice: "slice-ops" },
  "evt-device-registered": { cmdId: "cmd-register-device", cmdName: "RegisterDevice", slice: "slice-auth" },
  "evt-device-revoked": { cmdId: "cmd-revoke-device", cmdName: "RevokeDevice", slice: "slice-auth" },
  "evt-entitlement-imported": { cmdId: "cmd-import-entitlement", cmdName: "ImportEntitlement", slice: "slice-ops" },
  "evt-trial-started": { cmdId: "cmd-start-trial", cmdName: "StartTrial", slice: "slice-auth" },
  "evt-subscription-activated": {
    cmdId: "cmd-activate-subscription",
    cmdName: "ActivateSubscription",
    slice: "slice-billing",
  },
  "evt-subscription-updated": {
    cmdId: "cmd-update-subscription",
    cmdName: "UpdateSubscription",
    slice: "slice-billing",
  },
  "evt-subscription-cancelled": {
    cmdId: "cmd-cancel-subscription",
    cmdName: "CancelSubscription",
    slice: "slice-billing",
  },
  "evt-payment-initiated": { cmdId: "cmd-initiate-payment", cmdName: "InitiatePayment", slice: "slice-billing" },
  "evt-payment-confirmed": { cmdId: "cmd-confirm-payment", cmdName: "ConfirmPayment", slice: "slice-billing" },
  "evt-payment-imported": { cmdId: "cmd-import-payment", cmdName: "ImportPayment", slice: "slice-billing" },
  "evt-manual-payment": {
    cmdId: "cmd-record-manual-payment",
    cmdName: "RecordManualPayment",
    slice: "slice-billing",
  },
  "evt-exam-submitted": { cmdId: "cmd-submit-exam", cmdName: "SubmitExam", slice: "slice-exam" },
  "evt-interview-started": {
    cmdId: "cmd-start-interview-session",
    cmdName: "StartSession",
    slice: "slice-interview",
  },
  "evt-interview-scored": { cmdId: "cmd-score-interview-answer", cmdName: "ScoreAnswer", slice: "slice-interview" },
  "evt-interview-advanced": {
    cmdId: "cmd-advance-interview-question",
    cmdName: "AdvanceQuestion",
    slice: "slice-interview",
  },
  "evt-interview-finished": {
    cmdId: "cmd-finish-interview-session",
    cmdName: "FinishSession",
    slice: "slice-interview",
  },
  "evt-interview-abandoned": {
    cmdId: "cmd-abandon-interview-session",
    cmdName: "AbandonSession",
    slice: "slice-interview",
  },
  "evt-group-created": { cmdId: "cmd-create-group", cmdName: "CreateGroup", slice: "slice-ops" },
  "evt-join-code-set": { cmdId: "cmd-set-join-code", cmdName: "SetJoinCode", slice: "slice-groups" },
  "evt-member-joined": { cmdId: "cmd-join-group", cmdName: "JoinGroup", slice: "slice-groups" },
  "evt-member-left": { cmdId: "cmd-leave-group", cmdName: "LeaveGroup", slice: "slice-groups" },
  "evt-group-settings-updated": {
    cmdId: "cmd-update-group-settings",
    cmdName: "UpdateGroupSettings",
    slice: "slice-ops",
  },
  "evt-joint-opened": { cmdId: "cmd-open-joint-exam", cmdName: "OpenJointExam", slice: "slice-groups" },
  "evt-joint-closed": { cmdId: "cmd-close-joint-exam", cmdName: "CloseJointExam", slice: "slice-groups" },
  "evt-flag-imported": { cmdId: "cmd-import-flag", cmdName: "ImportFlag", slice: "slice-ops" },
  "evt-flag-raised": { cmdId: "cmd-raise-flag", cmdName: "RaiseFlag", slice: "slice-trust" },
  "evt-flag-resolved": { cmdId: "cmd-resolve-flag", cmdName: "ResolveFlag", slice: "slice-trust" },
};

const EVENT_SLICE = Object.fromEntries(
  Object.entries(COMMAND_FOR_EVENT).map(([evt, { slice }]) => [evt, slice]),
);

const SCREENS = [
  {
    id: "scr-auth-google",
    name: "Google sign-in",
    lane: "lane-web",
    actor: "Learner",
    slice: "slice-auth",
    notes: "GET /auth/google/callback — AuthController",
  },
  {
    id: "scr-mobile-auth",
    name: "Mobile sign-in",
    lane: "lane-mobile",
    actor: "Learner",
    slice: "slice-auth",
    notes: "POST /api/mobile/v1/auth/google|guest",
  },
  {
    id: "scr-settings-devices",
    name: "Settings · devices",
    lane: "lane-web",
    actor: "Learner",
    slice: "slice-auth",
    notes: "SettingsLive revoke_device",
  },
  {
    id: "scr-mobile-settings",
    name: "Mobile · devices",
    lane: "lane-mobile",
    actor: "Learner",
    slice: "slice-auth",
    notes: "DELETE /api/mobile/v1/devices/:token",
  },
  {
    id: "scr-sys-device-cap",
    name: "Device cap (system)",
    lane: "lane-web",
    actor: "System",
    slice: "slice-auth",
    notes: "Accounts.register_device revokes 3rd device",
  },
  {
    id: "scr-subscription",
    name: "Subscription checkout",
    lane: "lane-web",
    actor: "Learner",
    slice: "slice-billing",
    notes: "/settings/subscription — start_checkout, cancel",
  },
  {
    id: "scr-pay-return",
    name: "Payment return",
    lane: "lane-web",
    actor: "Learner",
    slice: "slice-billing",
    notes: "/pay/return — activate_after_checkout",
  },
  {
    id: "scr-mobile-billing",
    name: "Mobile billing",
    lane: "lane-mobile",
    actor: "Learner",
    slice: "slice-billing",
    notes: "/api/mobile/v1/billing/*",
  },
  {
    id: "scr-sys-webhook-paystack",
    name: "Paystack webhooks",
    lane: "lane-ops-ui",
    actor: "Paystack",
    slice: "slice-billing",
    notes: "POST /webhooks/paystack",
  },
  {
    id: "scr-sys-webhook-monnify",
    name: "Monnify webhooks",
    lane: "lane-ops-ui",
    actor: "Monnify",
    slice: "slice-billing",
    notes: "POST /webhooks/monnify",
  },
  {
    id: "scr-sys-billing-reconcile",
    name: "Billing reconcile",
    lane: "lane-ops-ui",
    actor: "System",
    slice: "slice-billing",
    notes: "Billing.reconcile_reference / return URL",
  },
  {
    id: "scr-sys-billing-poll",
    name: "Billing poll & renew",
    lane: "lane-ops-ui",
    actor: "System",
    slice: "slice-billing",
    notes: "Billing.poll_all, Monnify renewals",
  },
  {
    id: "scr-sys-grant-manual",
    name: "Manual payment (ops)",
    lane: "lane-ops-ui",
    actor: "Ops",
    slice: "slice-billing",
    notes: "Billing.grant_manual — IEx/scripts",
  },
  {
    id: "scr-me-hub",
    name: "Practice hub",
    lane: "lane-web",
    actor: "Learner",
    slice: "slice-exam",
    notes: "/me/:slug — exam submit, flag during drill/exam",
  },
  {
    id: "scr-joint-exam",
    name: "Joint exam",
    lane: "lane-web",
    actor: "Learner",
    slice: "slice-exam",
    notes: "/study-groups/:id/take/:sid",
  },
  {
    id: "scr-mobile-practice",
    name: "Mobile practice",
    lane: "lane-mobile",
    actor: "Learner",
    slice: "slice-exam",
    notes: "POST /api/mobile/v1/exams/submit, /questions/flag",
  },
  {
    id: "scr-interview",
    name: "Interview drill",
    lane: "lane-web",
    actor: "Learner",
    slice: "slice-interview",
    notes: "/interview — MeLive interview flow (web only)",
  },
  {
    id: "scr-study-group",
    name: "Study group admin",
    lane: "lane-web",
    actor: "Group host",
    slice: "slice-groups",
    notes: "/study-groups/:id — invite, joint exam open/close",
  },
  {
    id: "scr-join-group",
    name: "Join study group",
    lane: "lane-web",
    actor: "Learner",
    slice: "slice-groups",
    notes: "/study-groups/join/:code",
  },
  {
    id: "scr-mobile-study-groups",
    name: "Mobile study groups",
    lane: "lane-mobile",
    actor: "Learner",
    slice: "slice-groups",
    notes: "/api/mobile/v1/study-groups/*",
  },
  {
    id: "scr-settings-admin",
    name: "Settings · admin",
    lane: "lane-web",
    actor: "Admin",
    slice: "slice-trust",
    notes: "/settings/admin — resolve_flag",
  },
  {
    id: "scr-int-ops",
    name: "Ops & migration",
    lane: "lane-ops-ui",
    actor: "Ops",
    slice: "slice-ops",
    notes: "IEx: seed groups, imports, group settings rename",
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
  ["scr-sys-device-cap", "cmd-revoke-device"],
  ["scr-subscription", "cmd-initiate-payment"],
  ["scr-subscription", "cmd-cancel-subscription"],
  ["scr-mobile-billing", "cmd-initiate-payment"],
  ["scr-mobile-billing", "cmd-cancel-subscription"],
  ["scr-mobile-billing", "cmd-activate-subscription"],
  ["scr-pay-return", "cmd-activate-subscription"],
  ["scr-sys-webhook-paystack", "cmd-confirm-payment"],
  ["scr-sys-webhook-paystack", "cmd-import-payment"],
  ["scr-sys-webhook-paystack", "cmd-activate-subscription"],
  ["scr-sys-webhook-paystack", "cmd-update-subscription"],
  ["scr-sys-webhook-paystack", "cmd-cancel-subscription"],
  ["scr-sys-webhook-monnify", "cmd-confirm-payment"],
  ["scr-sys-webhook-monnify", "cmd-import-payment"],
  ["scr-sys-webhook-monnify", "cmd-activate-subscription"],
  ["scr-sys-webhook-monnify", "cmd-update-subscription"],
  ["scr-sys-webhook-monnify", "cmd-cancel-subscription"],
  ["scr-sys-billing-reconcile", "cmd-confirm-payment"],
  ["scr-sys-billing-reconcile", "cmd-import-payment"],
  ["scr-sys-billing-reconcile", "cmd-activate-subscription"],
  ["scr-sys-billing-poll", "cmd-initiate-payment"],
  ["scr-sys-billing-poll", "cmd-update-subscription"],
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
  ["scr-mobile-study-groups", "cmd-join-group"],
  ["scr-mobile-study-groups", "cmd-set-join-code"],
  ["scr-mobile-study-groups", "cmd-open-joint-exam"],
  ["scr-mobile-study-groups", "cmd-close-joint-exam"],
  ["scr-settings-admin", "cmd-resolve-flag"],
  ["scr-int-ops", "cmd-import-device"],
  ["scr-int-ops", "cmd-import-entitlement"],
  ["scr-int-ops", "cmd-import-payment"],
  ["scr-int-ops", "cmd-import-flag"],
  ["scr-int-ops", "cmd-create-group"],
  ["scr-int-ops", "cmd-update-group-settings"],
];

const events = doc.nodes.filter((n) => n.type === "event");
for (const e of events) {
  if (EVENT_SLICE[e.id]) e.sliceId = EVENT_SLICE[e.id];
}

const commands = Object.entries(COMMAND_FOR_EVENT).map(([evtId, meta]) => ({
  type: "command",
  id: meta.cmdId,
  name: meta.cmdName,
  swimlaneId: "lane-writes",
  sliceId: meta.slice,
  input: [],
  produces: [evtId],
  rejections: [],
  ...(evtId === "evt-member-left"
    ? { notes: "Command exists; no product UI wired yet (LeaveGroup)" }
    : {}),
}));

const screens = SCREENS.map((s) => {
  const node = {
    type: "screen",
    id: s.id,
    name: s.name,
    swimlaneId: s.lane,
    sliceId: s.slice,
    actor: s.actor,
    bindings: [],
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

const streamEdges = doc.edges.filter((e) => e.rel === "ordersBefore" || e.rel === "loopsBack");

doc.meta.modelVersion = 5;
doc.meta.name = "Apex Bee — EventStore streams + timeline stack";
doc.swimlanes = [...EXTRA_SWIMLANES, ...doc.swimlanes.filter((s) => s.band === "events")];
doc.nodes = [...events, ...commands, ...screens];
doc.edges = [...streamEdges, ...emEdges];

writeFileSync(path, `${JSON.stringify(doc, null, 2)}\n`);
console.log(
  `Updated ${path}: ${commands.length} commands, ${screens.length} screens, ${emEdges.length} EM edges`,
);
