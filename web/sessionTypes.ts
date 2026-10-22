export type ViewportState = {
  x: number;
  y: number;
  zoom: number;
};

export type DiagramMode = "swimlane" | "timeline";

export type SessionBoard = {
  diagramMode: DiagramMode;
  showAll: boolean;
  openEventIds: string[];
  openOrder: string[];
  focusAnchorId: string | null;
  workflowFromEventId: string | null;
  workflowToEventId: string | null;
};

export type SessionSnapshot = {
  version: 2;
  board: SessionBoard & {
    /** @deprecated Read for migration only; prefer focusAnchorId. */
    focusEventId?: string | null;
  };
  viewport: ViewportState | null;
};

/** @deprecated v1 snapshots; migrated on hydrate. */
export type SessionSnapshotV1 = Omit<SessionSnapshot, "version"> & { version: 1 };
