import type { SessionSnapshot, ViewportState } from "./sessionTypes.js";
export type { SessionSnapshot, ViewportState, SessionBoard } from "./sessionTypes.js";

export type SessionState = {
  board: SessionSnapshot["board"];
  viewport: ViewportState | null;
  /** True after first hydrate from storage or defaults. */
  hydrated: boolean;
};

export type CameraIntent =
  | { type: "Preserve" }
  | { type: "FrameStoryTimeline" }
  | { type: "FrameFocusClosure"; anchorId: string }
  | { type: "FrameVisibleOpen" }
  | { type: "FrameFullBoard" };

export type SessionAction =
  | { type: "HYDRATE"; snapshot: SessionSnapshot | null }
  | { type: "EVENT_CLICK"; eventId: string }
  | { type: "FOCUS_ANCHOR_TOGGLE"; nodeId: string }
  | { type: "RESET_STORY" }
  | { type: "SHOW_ALL_ON" }
  | { type: "TOGGLE_STORY_OR_SHOW_ALL" }
  | { type: "VIEWPORT"; viewport: ViewportState };

const emptyBoard = (): SessionSnapshot["board"] => ({
  showAll: false,
  openEventIds: [],
  openOrder: [],
  focusAnchorId: null,
});

export function defaultSessionState(): SessionState {
  return { board: emptyBoard(), viewport: null, hydrated: false };
}

function boardFromSnapshot(snapshot: SessionSnapshot): SessionSnapshot["board"] {
  const raw = snapshot.board;
  const focusAnchorId =
    raw.focusAnchorId ?? raw.focusEventId ?? null;
  return {
    showAll: raw.showAll,
    openEventIds: [...raw.openEventIds],
    openOrder: [...raw.openOrder],
    focusAnchorId,
  };
}

function nextBoardOnEventClick(board: SessionSnapshot["board"], eventId: string): SessionSnapshot["board"] {
  const open = new Set(board.openEventIds);
  const order = [...board.openOrder];

  if (!open.has(eventId)) {
    open.add(eventId);
    if (!order.includes(eventId)) order.push(eventId);
    return {
      showAll: false,
      openEventIds: [...open],
      openOrder: order,
      focusAnchorId: eventId,
    };
  }

  if (board.focusAnchorId === eventId) {
    open.delete(eventId);
    const nextOrder = order.filter((id) => id !== eventId);
    const stillOpen = nextOrder.filter((id) => open.has(id));
    const focus = stillOpen.length > 0 ? stillOpen[stillOpen.length - 1]! : null;
    return {
      showAll: false,
      openEventIds: [...open],
      openOrder: nextOrder,
      focusAnchorId: focus,
    };
  }

  return { ...board, showAll: false, focusAnchorId: eventId };
}

function nextBoardOnFocusAnchorToggle(
  board: SessionSnapshot["board"],
  nodeId: string,
): SessionSnapshot["board"] {
  const nextAnchor = board.focusAnchorId === nodeId ? null : nodeId;
  return {
    ...board,
    showAll: false,
    focusAnchorId: nextAnchor,
  };
}

function cameraAfterFocusAnchorChange(
  before: SessionSnapshot["board"],
  after: SessionSnapshot["board"],
): CameraIntent {
  const prev = before.focusAnchorId;
  const next = after.focusAnchorId;

  if (next && next !== prev) {
    return { type: "FrameFocusClosure", anchorId: next };
  }
  if (prev && !next) {
    if (after.openEventIds.length === 0) return { type: "FrameStoryTimeline" };
    return { type: "FrameVisibleOpen" };
  }
  return { type: "Preserve" };
}

function cameraForEventClick(
  before: SessionSnapshot["board"],
  after: SessionSnapshot["board"],
  eventId: string,
): CameraIntent {
  const wasOpen = before.openEventIds.includes(eventId);
  const isOpen = after.openEventIds.includes(eventId);

  if (!wasOpen && isOpen && after.focusAnchorId) {
    return { type: "FrameFocusClosure", anchorId: after.focusAnchorId };
  }
  if (wasOpen && !isOpen) {
    if (after.openEventIds.length === 0 && !after.focusAnchorId) {
      return { type: "FrameStoryTimeline" };
    }
    if (after.openEventIds.length === 0 && after.focusAnchorId) {
      return { type: "FrameFocusClosure", anchorId: after.focusAnchorId };
    }
    return { type: "FrameVisibleOpen" };
  }
  if (
    wasOpen &&
    isOpen &&
    before.focusAnchorId !== eventId &&
    after.focusAnchorId === eventId
  ) {
    return { type: "FrameFocusClosure", anchorId: eventId };
  }
  return { type: "Preserve" };
}

function cameraOnHydrate(board: SessionSnapshot["board"], hasViewport: boolean): CameraIntent {
  if (hasViewport) return { type: "Preserve" };
  if (board.focusAnchorId) {
    return { type: "FrameFocusClosure", anchorId: board.focusAnchorId };
  }
  return { type: "FrameStoryTimeline" };
}

export type ReduceResult = { state: SessionState; camera: CameraIntent };

export function reduceSession(state: SessionState, action: SessionAction): ReduceResult {
  switch (action.type) {
    case "HYDRATE": {
      if (!action.snapshot) {
        return {
          state: { board: emptyBoard(), viewport: null, hydrated: true },
          camera: { type: "FrameStoryTimeline" },
        };
      }
      const board = boardFromSnapshot(action.snapshot);
      return {
        state: {
          board,
          viewport: action.snapshot.viewport,
          hydrated: true,
        },
        camera: cameraOnHydrate(board, action.snapshot.viewport != null),
      };
    }
    case "EVENT_CLICK": {
      const before = state.board;
      const board = nextBoardOnEventClick(before, action.eventId);
      return {
        state: { ...state, board },
        camera: cameraForEventClick(before, board, action.eventId),
      };
    }
    case "FOCUS_ANCHOR_TOGGLE": {
      const before = state.board;
      const board = nextBoardOnFocusAnchorToggle(before, action.nodeId);
      return {
        state: { ...state, board },
        camera: cameraAfterFocusAnchorChange(before, board),
      };
    }
    case "RESET_STORY":
      return {
        state: { ...state, board: emptyBoard(), viewport: state.viewport },
        camera: { type: "FrameStoryTimeline" },
      };
    case "SHOW_ALL_ON":
      return {
        state: {
          ...state,
          board: { ...emptyBoard(), showAll: true },
        },
        camera: { type: "FrameFullBoard" },
      };
    case "TOGGLE_STORY_OR_SHOW_ALL": {
      if (state.board.showAll || state.board.openEventIds.length > 0 || state.board.focusAnchorId) {
        return {
          state: { ...state, board: emptyBoard() },
          camera: { type: "FrameStoryTimeline" },
        };
      }
      return {
        state: { ...state, board: { ...emptyBoard(), showAll: true } },
        camera: { type: "FrameFullBoard" },
      };
    }
    case "VIEWPORT":
      return {
        state: { ...state, viewport: action.viewport },
        camera: { type: "Preserve" },
      };
    default:
      return { state, camera: { type: "Preserve" } };
  }
}

export function sessionToFocusState(session: SessionState, hoverExpandedId: string | null) {
  const { board } = session;
  return {
    showAll: board.showAll,
    focusAnchorId: board.focusAnchorId,
    openEventIds: new Set(board.openEventIds),
    hoverExpandedId,
  };
}

export function boardToPersistable(board: SessionSnapshot["board"]): SessionSnapshot["board"] {
  return {
    showAll: board.showAll,
    openEventIds: [...board.openEventIds],
    openOrder: [...board.openOrder],
    focusAnchorId: board.focusAnchorId,
  };
}
