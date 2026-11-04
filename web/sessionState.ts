import { normalizeDiagramMode } from "./diagramMode.js";
import type { SessionSnapshot, ViewportState } from "./sessionTypes.js";
import type { DiagramMode } from "./sessionTypes.js";
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
  | { type: "FrameDesignBoard" }
  | { type: "FrameFocusClosure"; anchorId: string }
  | { type: "FrameVisibleOpen" }
  | { type: "FrameFullBoard" }
  | { type: "FrameWorkflowPath"; fromEventId: string; toEventId: string };

export type SessionAction =
  | { type: "HYDRATE"; snapshot: SessionSnapshot | null }
  | { type: "EVENT_CLICK"; eventId: string }
  | { type: "TOGGLE_STREAM_SELECTION"; eventIds: string[] }
  | { type: "FOCUS_ANCHOR_TOGGLE"; nodeId: string }
  | { type: "RESET_STORY" }
  | { type: "SHOW_ALL_ON" }
  | { type: "TOGGLE_STORY_OR_SHOW_ALL" }
  | { type: "VIEWPORT"; viewport: ViewportState }
  | { type: "WORKFLOW_SET_FROM"; eventId: string | null }
  | { type: "WORKFLOW_SET_TO"; eventId: string | null }
  | { type: "WORKFLOW_CLEAR" }
  | {
      type: "SET_DIAGRAM_MODE";
      mode: DiagramMode;
      /** Narrative span to apply when entering Timeline from a Streams selection. */
      workflowFromEventId?: string | null;
      workflowToEventId?: string | null;
    };

const emptyBoard = (): SessionSnapshot["board"] => ({
  diagramMode: "design",
  showAll: false,
  openEventIds: [],
  openOrder: [],
  focusAnchorId: null,
  workflowFromEventId: null,
  workflowToEventId: null,
});

export function defaultSessionState(): SessionState {
  return { board: emptyBoard(), viewport: null, hydrated: false };
}

function boardFromSnapshot(snapshot: SessionSnapshot): SessionSnapshot["board"] {
  const raw = snapshot.board;
  const focusAnchorId =
    raw.focusAnchorId ?? raw.focusEventId ?? null;
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
    focusAnchorId,
    workflowFromEventId: raw.workflowFromEventId ?? null,
    workflowToEventId: raw.workflowToEventId ?? null,
  };
}

function cameraForDiagramMode(board: SessionSnapshot["board"]): CameraIntent {
  if (board.diagramMode === "design") {
    return board.focusAnchorId ?
        { type: "FrameFocusClosure", anchorId: board.focusAnchorId }
      : { type: "FrameDesignBoard" };
  }
  if (board.diagramMode === "timeline") {
    return board.focusAnchorId ?
        { type: "FrameFocusClosure", anchorId: board.focusAnchorId }
      : { type: "FrameFullBoard" };
  }
  return { type: "FrameStoryTimeline" };
}

function nextBoardOnStreamEventClick(
  board: SessionSnapshot["board"],
  eventId: string,
): SessionSnapshot["board"] {
  const open = new Set(board.openEventIds);
  const order = board.openOrder.filter((id) => id !== eventId);
  if (open.has(eventId)) open.delete(eventId);
  else {
    open.add(eventId);
    order.push(eventId);
  }
  return {
    ...board,
    showAll: false,
    openEventIds: [...open],
    openOrder: order,
    focusAnchorId: null,
  };
}

function nextBoardOnStreamToggle(
  board: SessionSnapshot["board"],
  eventIds: readonly string[],
): SessionSnapshot["board"] {
  const open = new Set(board.openEventIds);
  const allSelected = eventIds.length > 0 && eventIds.every((id) => open.has(id));
  if (allSelected) {
    for (const id of eventIds) open.delete(id);
  } else {
    for (const id of eventIds) open.add(id);
  }
  const order = board.openOrder.filter((id) => open.has(id));
  for (const id of open) {
    if (!order.includes(id)) order.push(id);
  }
  return {
    ...board,
    showAll: false,
    openEventIds: [...open],
    openOrder: order,
    focusAnchorId: null,
  };
}

function nextBoardOnEventClick(board: SessionSnapshot["board"], eventId: string): SessionSnapshot["board"] {
  if (board.diagramMode === "stream") return nextBoardOnStreamEventClick(board, eventId);
  const open = new Set(board.openEventIds);
  const order = [...board.openOrder];

  if (!open.has(eventId)) {
    open.add(eventId);
    if (!order.includes(eventId)) order.push(eventId);
    return {
      ...board,
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
      ...board,
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
  if (before.diagramMode === "stream") return { type: "Preserve" };
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

function cameraForWorkflowEndpoints(board: SessionSnapshot["board"]): CameraIntent {
  if (board.diagramMode === "timeline") return { type: "Preserve" };
  if (board.workflowFromEventId && board.workflowToEventId) {
    return {
      type: "FrameWorkflowPath",
      fromEventId: board.workflowFromEventId,
      toEventId: board.workflowToEventId,
    };
  }
  return { type: "Preserve" };
}

function cameraOnHydrate(board: SessionSnapshot["board"], hasViewport: boolean): CameraIntent {
  if (board.diagramMode === "timeline") {
    return cameraForDiagramMode(board);
  }
  if (board.workflowFromEventId && board.workflowToEventId) {
    return cameraForWorkflowEndpoints(board);
  }
  if (board.diagramMode === "design" || board.diagramMode === "timeline") {
    return cameraForDiagramMode(board);
  }
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
          camera: { type: "FrameDesignBoard" },
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
    case "TOGGLE_STREAM_SELECTION":
      return {
        state: {
          ...state,
          board: nextBoardOnStreamToggle(state.board, action.eventIds),
        },
        camera: { type: "Preserve" },
      };
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
        camera: { type: "FrameDesignBoard" },
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
          camera: { type: "FrameDesignBoard" },
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
    case "WORKFLOW_SET_FROM": {
      const board = { ...state.board, workflowFromEventId: action.eventId };
      return {
        state: { ...state, board },
        camera: cameraForWorkflowEndpoints(board),
      };
    }
    case "WORKFLOW_SET_TO": {
      const board = { ...state.board, workflowToEventId: action.eventId };
      return {
        state: { ...state, board },
        camera: cameraForWorkflowEndpoints(board),
      };
    }
    case "WORKFLOW_CLEAR":
      return {
        state: {
          ...state,
          board: {
            ...state.board,
            workflowFromEventId: null,
            workflowToEventId: null,
          },
        },
        camera: { type: "FrameStoryTimeline" },
      };
    case "SET_DIAGRAM_MODE": {
      const board = {
        ...state.board,
        diagramMode: action.mode,
        showAll: false,
        focusAnchorId:
          action.mode === "stream" || action.mode === "timeline" ? null : state.board.focusAnchorId,
        workflowFromEventId:
          action.mode === "timeline"
            ? (action.workflowFromEventId !== undefined
                ? action.workflowFromEventId
                : state.board.workflowFromEventId)
            : null,
        workflowToEventId:
          action.mode === "timeline"
            ? (action.workflowToEventId !== undefined
                ? action.workflowToEventId
                : state.board.workflowToEventId)
            : null,
      };
      return {
        state: { ...state, board },
        camera: { type: "Preserve" },
      };
    }
    default:
      return { state, camera: { type: "Preserve" } };
  }
}

export function sessionToFocusState(session: SessionState, hoverExpandedId: string | null) {
  const { board } = session;
  return {
    diagramMode: board.diagramMode,
    showAll: board.showAll,
    focusAnchorId: board.focusAnchorId,
    openEventIds: new Set(board.openEventIds),
    hoverExpandedId,
    workflowPath: { status: "inactive" as const },
  };
}

export function boardToPersistable(board: SessionSnapshot["board"]): SessionSnapshot["board"] {
  return {
    diagramMode: board.diagramMode,
    showAll: board.showAll,
    openEventIds: [...board.openEventIds],
    openOrder: [...board.openOrder],
    focusAnchorId: board.focusAnchorId,
    workflowFromEventId: board.workflowFromEventId,
    workflowToEventId: board.workflowToEventId,
  };
}
