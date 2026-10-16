import type { SessionSnapshot, ViewportState } from "./sessionTypes.js";

export const SESSION_STORAGE_KEY = "event-model-blueprint.session.v1";

export function loadPersistedSession(): SessionSnapshot | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionSnapshot;
    if (parsed.version !== 1) return null;
    if (!parsed.board || !Array.isArray(parsed.board.openEventIds)) return null;
    return parsed;
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
  return { version: 1, board, viewport };
}
