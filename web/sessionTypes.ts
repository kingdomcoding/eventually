export type ViewportState = {
  x: number;
  y: number;
  zoom: number;
};

export type SessionBoard = {
  showAll: boolean;
  openEventIds: string[];
  openOrder: string[];
  focusAnchorId: string | null;
  workflowFromEventId: string | null;
  workflowToEventId: string | null;
};

export type SessionSnapshot = {
  version: 1;
  board: SessionBoard & {
    /** @deprecated Read for migration only; prefer focusAnchorId. */
    focusEventId?: string | null;
  };
  viewport: ViewportState | null;
};
