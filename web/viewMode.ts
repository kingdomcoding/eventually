import type { BlueprintDocument } from "@schema/document.js";
import {
  eventDetailCluster,
  focusAnimateEdgeClosure,
  focusEmphasisClosure,
} from "./graphIndex.js";
import type { WorkflowPathResult } from "./workflowPath.js";

export type FocusState = {
  showAll: boolean;
  focusAnchorId: string | null;
  /** Visibility: events explicitly opened by click; detail stays until that event is closed. */
  openEventIds: ReadonlySet<string>;
  hoverExpandedId: string | null;
  workflowPath: WorkflowPathResult;
};

export type PreviewPhase = "idle" | "active" | "leaving";

export type DisplayTier = "hidden" | "context" | "preview" | "full";

const DETAIL_RELS = new Set(["issues", "produces", "updates", "rendersOn"]);

export function connectedNodeIds(doc: BlueprintDocument, eventId: string): Set<string> {
  return eventDetailCluster(doc, eventId);
}

export function focusHold(state: FocusState): boolean {
  return !state.showAll && state.openEventIds.size === 0 && state.focusAnchorId !== null;
}

/** Sticky node ids currently shown (not hidden tier) for camera framing. */
export function visibleDiagramNodeIds(
  doc: BlueprintDocument,
  state: FocusState,
  previewPhase: PreviewPhase,
): string[] {
  const ids: string[] = [];
  for (const n of doc.nodes) {
    if (nodeDisplayTier(doc, n.id, state, previewPhase) !== "hidden") ids.push(n.id);
  }
  return ids;
}

function inOpenDetail(
  doc: BlueprintDocument,
  nodeId: string,
  openEventIds: ReadonlySet<string>,
): boolean {
  for (const eventId of openEventIds) {
    if (connectedNodeIds(doc, eventId).has(nodeId)) return true;
  }
  return false;
}

function inHoverCluster(doc: BlueprintDocument, nodeId: string, hoverExpandedId: string | null): boolean {
  if (!hoverExpandedId) return false;
  return connectedNodeIds(doc, hoverExpandedId).has(nodeId);
}

function boardIsExpanded(state: FocusState): boolean {
  return state.openEventIds.size > 0;
}

function inEmphasis(doc: BlueprintDocument, nodeId: string, anchorId: string): boolean {
  return focusEmphasisClosure(doc, anchorId).has(nodeId);
}

function workflowValid(state: FocusState): state is FocusState & {
  workflowPath: Extract<WorkflowPathResult, { status: "valid" }>;
} {
  return state.workflowPath.status === "valid";
}

function poiLift(doc: BlueprintDocument, nodeId: string, state: FocusState): boolean {
  const anchorId = state.focusAnchorId;
  const allowHoverPreview = anchorId === null;
  const hoverOnly =
    allowHoverPreview &&
    state.hoverExpandedId &&
    state.hoverExpandedId !== anchorId &&
    inHoverCluster(doc, nodeId, state.hoverExpandedId);
  if (hoverOnly) return true;
  if (anchorId && (nodeId === anchorId || inEmphasis(doc, nodeId, anchorId))) return true;
  if (inOpenDetail(doc, nodeId, state.openEventIds)) return true;
  return false;
}

function workflowNodeTier(
  doc: BlueprintDocument,
  nodeId: string,
  state: FocusState,
  previewPhase: PreviewPhase,
): DisplayTier | null {
  if (!workflowValid(state)) return null;
  const wp = state.workflowPath;
  const n = doc.nodes.find((x) => x.id === nodeId);
  if (!n) return "hidden";

  if (wp.eventIds.has(nodeId)) return "full";

  if (poiLift(doc, nodeId, state)) {
    if (state.focusAnchorId === nodeId) return "full";
    if (inOpenDetail(doc, nodeId, state.openEventIds)) return "full";
    return "preview";
  }

  if (n.type === "event") return "context";
  return "hidden";
}

export function nodeDisplayTier(
  doc: BlueprintDocument,
  nodeId: string,
  state: FocusState,
  previewPhase: PreviewPhase,
): DisplayTier {
  const n = doc.nodes.find((x) => x.id === nodeId);
  if (!n) return "hidden";

  if (state.showAll) {
    if (workflowValid(state)) {
      const wf = workflowNodeTier(doc, nodeId, state, previewPhase);
      if (wf === "full") return "full";
      return "context";
    }
    return "full";
  }

  const workflowTier = workflowNodeTier(doc, nodeId, state, previewPhase);
  if (workflowTier !== null) return workflowTier;

  const anchorId = state.focusAnchorId;
  const allowHoverPreview = anchorId === null;
  const hoverOnly =
    allowHoverPreview &&
    state.hoverExpandedId &&
    state.hoverExpandedId !== anchorId &&
    inHoverCluster(doc, nodeId, state.hoverExpandedId);

  if (focusHold(state) && anchorId) {
    if (nodeId === anchorId || inEmphasis(doc, nodeId, anchorId)) return "full";
    if (n.type === "event") return "context";
    return "hidden";
  }

  if (anchorId && boardIsExpanded(state)) {
    if (nodeId === anchorId || inEmphasis(doc, nodeId, anchorId)) return "full";
    if (n.type === "event") return "context";
    if (hoverOnly) return "preview";
    if (inOpenDetail(doc, nodeId, state.openEventIds)) return "context";
    return "hidden";
  }

  if (n.type === "event") {
    if (anchorId === nodeId) return "full";
    if (anchorId) return "context";
    return "full";
  }

  if (anchorId && inEmphasis(doc, nodeId, anchorId)) return "full";
  if (hoverOnly) return "preview";
  if (inOpenDetail(doc, nodeId, state.openEventIds)) return "context";
  if (!boardIsExpanded(state) && allowHoverPreview && inHoverCluster(doc, nodeId, state.hoverExpandedId)) {
    return "preview";
  }
  return "hidden";
}

export function edgeShouldAnimate(
  doc: BlueprintDocument,
  blueprintEdgeId: string,
  state: FocusState,
  previewPhase: PreviewPhase,
): boolean {
  const be = doc.edges.find((e) => e.id === blueprintEdgeId);
  if (!be) return false;

  const tier = edgeDisplayTier(doc, blueprintEdgeId, state, previewPhase);
  if (tier === "hidden") return false;

  if (workflowValid(state) && be.rel === "ordersBefore" && state.workflowPath.edgeIds.has(blueprintEdgeId)) {
    return !state.showAll;
  }

  if (state.showAll) return false;

  if (state.focusAnchorId) {
    if (be.rel === "ordersBefore" || !DETAIL_RELS.has(be.rel)) return false;
    const cluster = focusAnimateEdgeClosure(doc, state.focusAnchorId);
    return cluster.has(be.from) && cluster.has(be.to);
  }

  if (state.openEventIds.size > 0) return false;

  return be.rel === "ordersBefore";
}

export function edgeDisplayTier(
  doc: BlueprintDocument,
  blueprintEdgeId: string,
  state: FocusState,
  previewPhase: PreviewPhase,
): DisplayTier {
  const be = doc.edges.find((e) => e.id === blueprintEdgeId);
  if (!be) return "hidden";

  if (workflowValid(state)) {
    const wp = state.workflowPath;
    if (be.rel === "ordersBefore") {
      if (wp.edgeIds.has(blueprintEdgeId)) return "full";
      return "context";
    }
    const fromTier = nodeDisplayTier(doc, be.from, state, previewPhase);
    const toTier = nodeDisplayTier(doc, be.to, state, previewPhase);
    if (fromTier === "hidden" || toTier === "hidden") return "hidden";
    if (fromTier === "preview" || toTier === "preview") return "preview";
    if (fromTier === "full" && toTier === "full") return "full";
    return "context";
  }

  if (state.showAll) return "full";

  if (be.rel === "ordersBefore") {
    return state.focusAnchorId || boardIsExpanded(state) || focusHold(state) ? "context" : "full";
  }

  if (!DETAIL_RELS.has(be.rel)) return "hidden";

  const fromTier = nodeDisplayTier(doc, be.from, state, previewPhase);
  const toTier = nodeDisplayTier(doc, be.to, state, previewPhase);

  if (fromTier === "hidden" || toTier === "hidden") return "hidden";
  if (fromTier === "preview" || toTier === "preview") return "preview";
  if (fromTier === "full" && toTier === "full") return "full";
  if (fromTier === "context" || toTier === "context") return "context";
  return "full";
}

export function previewOpacity(phase: PreviewPhase): number {
  if (phase === "active") return 0.52;
  if (phase === "leaving") return 0;
  return 0;
}

export const CONTEXT_OPACITY = 0.28;
export const WORKFLOW_OFF_PATH_OPACITY = 0.22;
