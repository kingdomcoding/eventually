import { normalizeDiagramMode } from "./diagramMode.js";
import type { SessionSnapshot, ViewportState } from "./sessionTypes.js";

export const SESSION_STORAGE_KEY = "event-model-blueprint.session.v2";

function normalizeBoard(raw: SessionSnapshot["board"]): SessionSnapshot["board"] {
  let diagramMode = normalizeDiagramMode(raw.diagramMode);
  let showAll = raw.showAll ?? false;
  if (showAll && raw.diagramMode == null) {
    diagramMode = "timeline";
    showAll = false;
  }
  return {
    diagramMode,
    showAll,
    openEventIds: [...raw.openEventIds],
    openOrder: [...raw.openOrder],
    focusAnchorId: raw.focusAnchorId ?? null,
    workflowFromEventId: raw.workflowFromEventId ?? null,
    workflowToEventId: raw.workflowToEventId ?? null,
  };
}

export function loadPersistedSession(): SessionSnapshot | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const v2 = localStorage.getItem(SESSION_STORAGE_KEY);
    if (v2) {
      const parsed = JSON.parse(v2) as SessionSnapshot;
      if (parsed.version !== 2 || !parsed.board || !Array.isArray(parsed.board.openEventIds)) return null;
      return { version: 2, board: normalizeBoard(parsed.board), viewport: parsed.viewport ?? null };
    }
    const legacyKey = "event-model-blueprint.session.v1";
    const v1raw = localStorage.getItem(legacyKey);
    if (!v1raw) return null;
    const parsed = JSON.parse(v1raw) as {
      version: 1;
      board: SessionSnapshot["board"] & { diagramMode?: string };
      viewport?: ViewportState | null;
    };
    if (parsed.version !== 1 || !parsed.board) return null;
    return {
      version: 2,
      board: normalizeBoard({ ...parsed.board, diagramMode: "swimlane" }),
      viewport: parsed.viewport ?? null,
    };
  } catch {
    return null;
  }
}

export function savePersistedSession(snapshot: SessionSnapshot): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    /* quota / private mode */
  }
}

export function snapshotFromBoard(
  board: SessionSnapshot["board"],
  viewport: ViewportState | null,
): SessionSnapshot {
  return { version: 2, board: normalizeBoard(board), viewport };
}
