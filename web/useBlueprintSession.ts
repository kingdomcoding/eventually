import { useCallback, useEffect, useRef, useState } from "react";

import {
  boardToPersistable,
  defaultSessionState,
  reduceSession,
  type CameraIntent,
  type SessionAction,
  type SessionState,
} from "./sessionState.js";
import { loadPersistedSession, savePersistedSession, snapshotFromBoard } from "./sessionPersistence.js";

export function useBlueprintSession(onCameraIntent: (intent: CameraIntent) => void) {
  const intentRef = useRef(onCameraIntent);
  intentRef.current = onCameraIntent;

  const [state, setState] = useState<SessionState>(defaultSessionState);
  const hydrateStarted = useRef(false);

  useEffect(() => {
    if (hydrateStarted.current) return;
    hydrateStarted.current = true;
    const snapshot = loadPersistedSession();
    setState((prev) => {
      const { state: next, camera } = reduceSession(prev, { type: "HYDRATE", snapshot });
      queueMicrotask(() => intentRef.current(camera));
      return next;
    });
  }, []);

  const dispatch = useCallback((action: SessionAction) => {
    setState((prev) => {
      const { state: next, camera } = reduceSession(prev, action);
      queueMicrotask(() => intentRef.current(camera));
      return next;
    });
  }, []);

  useEffect(() => {
    if (!state.hydrated) return;
    const timer = setTimeout(() => {
      savePersistedSession(
        snapshotFromBoard(boardToPersistable(state.board), state.viewport),
      );
    }, 400);
    return () => clearTimeout(timer);
  }, [state.board, state.viewport, state.hydrated]);

  const setViewport = useCallback(
    (viewport: NonNullable<SessionState["viewport"]>) => {
      dispatch({ type: "VIEWPORT", viewport });
    },
    [dispatch],
  );

  return { session: state, dispatch, setViewport };
}
