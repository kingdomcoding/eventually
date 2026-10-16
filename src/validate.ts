import type { BlueprintDocument } from "./document.js";
import { NODE_BAND } from "./document.js";
import type { BlueprintNode } from "./nodes.js";
import { ALLOWED_EDGES } from "./edges.js";

export type ValidationIssue = {
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
};

function nodeMap(doc: BlueprintDocument): Map<string, BlueprintNode> {
  return new Map(doc.nodes.map((n) => [n.id, n]));
}

export function validateBlueprint(doc: BlueprintDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const byId = nodeMap(doc);
  const swimlaneIds = new Set(doc.swimlanes.map((s) => s.id));

  const laneById = new Map(doc.swimlanes.map((s) => [s.id, s]));

  for (const n of doc.nodes) {
    if (!swimlaneIds.has(n.swimlaneId)) {
      issues.push({
        code: "unknown_swimlane",
        message: `Node references missing swimlane "${n.swimlaneId}"`,
        nodeId: n.id,
      });
      continue;
    }
    const lane = laneById.get(n.swimlaneId)!;
    const expected = NODE_BAND[n.type];
    if (expected && lane.band !== expected) {
      issues.push({
        code: "swimlane_band_mismatch",
        message: `Node type "${n.type}" must use a "${expected}" swimlane, not "${lane.band}"`,
        nodeId: n.id,
      });
    }
  }

  const ids = doc.nodes.map((n) => n.id);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dup.length) {
    issues.push({
      code: "duplicate_node_id",
      message: `Duplicate node ids: ${[...new Set(dup)].join(", ")}`,
    });
  }

  for (const e of doc.edges) {
    const from = byId.get(e.from);
    const to = byId.get(e.to);
    if (!from) {
      issues.push({ code: "dangling_edge", message: `Edge from missing node "${e.from}"`, edgeId: e.id });
    }
    if (!to) {
      issues.push({ code: "dangling_edge", message: `Edge to missing node "${e.to}"`, edgeId: e.id });
    }
    const rule = ALLOWED_EDGES[e.rel];
    if (from && to && rule) {
      if (!rule.fromTypes.includes(from.type) || !rule.toTypes.includes(to.type)) {
        issues.push({
          code: "invalid_edge_types",
          message: `Edge ${e.rel} cannot connect ${from.type} → ${to.type}`,
          edgeId: e.id,
        });
      }
    }
  }

  for (const n of doc.nodes) {
    if (n.type === "command") {
      for (const eventId of n.produces) {
        const ev = byId.get(eventId);
        if (!ev) {
          issues.push({
            code: "missing_produced_event",
            message: `Command "${n.name}" produces unknown event id "${eventId}"`,
            nodeId: n.id,
          });
        } else if (ev.type !== "event") {
          issues.push({
            code: "produces_not_event",
            message: `Command "${n.name}" must produce events, not ${ev.type}`,
            nodeId: n.id,
          });
        }
      }
    }

    if (n.type === "view") {
      for (const eventId of n.fedBy) {
        const ev = byId.get(eventId);
        if (!ev || ev.type !== "event") {
          issues.push({
            code: "view_fed_by_invalid",
            message: `View "${n.name}" fedBy must reference event nodes`,
            nodeId: n.id,
          });
        }
      }
    }

    if (n.type === "screen") {
      for (const b of n.bindings) {
        if (b.target.kind === "commandInput") {
          const cmd = byId.get(b.target.commandId);
          if (!cmd || cmd.type !== "command") {
            issues.push({
              code: "screen_binding_command",
              message: `Screen "${n.name}" binds to missing command`,
              nodeId: n.id,
            });
          }
        }
        if (b.target.kind === "viewField") {
          const view = byId.get(b.target.viewId);
          if (!view || view.type !== "view") {
            issues.push({
              code: "screen_binding_view",
              message: `Screen "${n.name}" binds to missing view`,
              nodeId: n.id,
            });
          }
        }
      }
    }
  }

  const events = doc.nodes.filter((n) => n.type === "event");
  const indices = events.map((e) => e.timelineIndex);
  const indexSet = new Set(indices);
  if (indexSet.size !== indices.length) {
    issues.push({
      code: "duplicate_timeline_index",
      message: "Two events share the same timelineIndex",
    });
  }

  return issues;
}
