import type { BlueprintDocument } from "@schema/document.js";
import type { StreamBand } from "@schema/document.js";

export function titleCaseLabel(value: string): string {
  return value.replace(/(^|\s)(\S)/g, (_lead, space: string, ch: string) => space + ch.toUpperCase());
}

/**
 * Swim-lane label for timeline stickies.
 * Actor (ui) lanes → "Who: …"; context/stream lanes (commands/events) → "Context: …".
 */
export function formatLaneLabel(
  band: StreamBand | undefined,
  streamName: string | undefined,
): string | undefined {
  if (!streamName) return undefined;
  const titled = titleCaseLabel(streamName);
  return band === "ui" ? `Who: ${titled}` : `Context: ${titled}`;
}

/** For: label from a consumer name (data table → screen/trigger/automation). */
export function formatContextLabel(consumerName: string): string {
  return `For: ${titleCaseLabel(consumerName)}`;
}

/**
 * Names of what a data table connects to: rendersOn screens/triggers first,
 * else observes automations. Order follows edge order in the document.
 */
export function dataTableConsumerNames(
  doc: BlueprintDocument,
  dataTableId: string,
): string[] {
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  const names: string[] = [];
  const seen = new Set<string>();
  for (const edge of doc.edges) {
    if (edge.rel !== "rendersOn" || edge.from !== dataTableId) continue;
    const ui = byId.get(edge.to);
    if (!ui || (ui.type !== "screen" && ui.type !== "trigger")) continue;
    if (seen.has(ui.name)) continue;
    seen.add(ui.name);
    names.push(ui.name);
  }
  if (names.length) return names;
  for (const edge of doc.edges) {
    if (edge.rel !== "observes" || edge.from !== dataTableId) continue;
    const auto = byId.get(edge.to);
    if (!auto || auto.type !== "automation") continue;
    if (seen.has(auto.name)) continue;
    seen.add(auto.name);
    names.push(auto.name);
  }
  return names;
}

/**
 * Context for a data table: prefer the host page (trigger parents / screens)
 * over element triggers, so Context names the page rather than a control on it.
 */
export function dataTableContextNames(
  doc: BlueprintDocument,
  dataTableId: string,
): string[] {
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  const pageNames: string[] = [];
  const screenNames: string[] = [];
  const triggerNames: string[] = [];
  const seenPages = new Set<string>();
  const seenScreens = new Set<string>();
  const seenTriggers = new Set<string>();
  for (const edge of doc.edges) {
    if (edge.rel !== "rendersOn" || edge.from !== dataTableId) continue;
    const ui = byId.get(edge.to);
    if (!ui) continue;
    if (ui.type === "screen") {
      if (seenScreens.has(ui.name)) continue;
      seenScreens.add(ui.name);
      screenNames.push(ui.name);
    } else if (ui.type === "trigger") {
      for (const parent of ui.parents ?? []) {
        if (seenPages.has(parent)) continue;
        seenPages.add(parent);
        pageNames.push(parent);
      }
      if (seenTriggers.has(ui.name)) continue;
      seenTriggers.add(ui.name);
      triggerNames.push(ui.name);
    }
  }
  if (pageNames.length) return pageNames;
  if (screenNames.length) return screenNames;
  if (triggerNames.length) return triggerNames;
  return dataTableConsumerNames(doc, dataTableId);
}

/** Lane label for a data table: For: page/consumer name(s). */
export function formatDataTableLaneLabel(
  doc: BlueprintDocument,
  dataTableId: string,
): string | undefined {
  const consumers = dataTableContextNames(doc, dataTableId);
  if (!consumers.length) return undefined;
  return `For: ${consumers.map(titleCaseLabel).join(", ")}`;
}

/**
 * Actor stream for a data table's Who: first rendersOn screen/trigger stream,
 * else observes automation stream.
 */
export function dataTableWhoStreamId(
  doc: BlueprintDocument,
  dataTableId: string,
): string | undefined {
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  for (const edge of doc.edges) {
    if (edge.rel !== "rendersOn" || edge.from !== dataTableId) continue;
    const ui = byId.get(edge.to);
    if (ui && (ui.type === "screen" || ui.type === "trigger")) return ui.streamId;
  }
  for (const edge of doc.edges) {
    if (edge.rel !== "observes" || edge.from !== dataTableId) continue;
    const auto = byId.get(edge.to);
    if (auto?.type === "automation") return auto.streamId;
  }
  return undefined;
}
