import { memo, useLayoutEffect, useRef, useState, type SyntheticEvent } from "react";
import { createPortal } from "react-dom";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { DisplayTier } from "./viewMode";

export type StickyField = {
  name: string;
  type: string;
  description: string;
};

export type StickyApiCase = {
  label: string;
  fields: StickyField[];
};

export type StickyData = {
  kind: string;
  name: string;
  subtitle?: string;
  /** Timeline cards: stream name in title case, shown above the node name. */
  streamTitle?: string;
  /** Timeline event/trigger/command/screen/view: stream title instead of kind; hide muted subtitle. */
  timelineEvent?: boolean;
  fields?: StickyField[];
  /** Command timeline: success/error shapes from the internal API client. */
  apiClientResponse?: StickyApiCase[];
  /** Report sticky box size so lane packing can clear expansions. */
  onMeasuredSize?: (nodeId: string, size: { width: number; height: number }) => void;
  isFocusAnchor?: boolean;
  onWorkflowRoute?: boolean;
  selected?: boolean;
  displayTier?: DisplayTier;
  previewPhase?: string;
  /** Outside the product boundary (e.g. hosted Paystack checkout). */
  external?: boolean;
  /** Screen/page names this control sits on (trigger parents). */
  parents?: string[];
};

/** Label for sticky parent pages: singular for one, comma-separated for many. */
export function formatParentsLabel(parents: string[]): string | null {
  if (parents.length === 0) return null;
  const prefix = parents.length === 1 ? "Parent" : "Parents";
  return `${prefix}: ${parents.join(", ")}`;
}

const RING_INSET = 1.25;
const RING_RX = 8;

function stopCardClick(event: SyntheticEvent) {
  event.stopPropagation();
}

const TIP_MAX_WIDTH = 280;
const TIP_GAP = 6;
const TIP_VIEWPORT_PAD = 8;

function tipStyleForAnchor(anchor: HTMLElement): { top: number; left: number; width: number } {
  const rect = anchor.getBoundingClientRect();
  const width = Math.min(TIP_MAX_WIDTH, Math.max(rect.width, 180));
  const left = Math.min(
    Math.max(TIP_VIEWPORT_PAD, rect.left),
    window.innerWidth - width - TIP_VIEWPORT_PAD,
  );
  const top = rect.bottom + TIP_GAP;
  return { top, left, width };
}

function StickyFieldRow({ field }: { field: StickyField }) {
  const rowRef = useRef<HTMLLIElement>(null);
  const [tip, setTip] = useState<{ top: number; left: number; width: number } | null>(null);

  const showTip = () => {
    const row = rowRef.current;
    if (!row) return;
    setTip(tipStyleForAnchor(row));
  };

  const hideTip = () => setTip(null);

  return (
    <li
      ref={rowRef}
      className="sticky-field"
      tabIndex={0}
      onMouseEnter={showTip}
      onMouseLeave={hideTip}
      onFocus={showTip}
      onBlur={hideTip}
    >
      <div className="sticky-field__line">
        <span className="sticky-fields__name">{field.name}</span>
        <span className="sticky-fields__type">
          {field.type}
          <svg className="sticky-fields__info" viewBox="0 0 16 16" aria-hidden="true">
            <path
              fill="currentColor"
              fillRule="evenodd"
              d="M8 1.1a6.9 6.9 0 1 0 0 13.8 6.9 6.9 0 0 0 0-13.8zm0 1.7a5.2 5.2 0 1 1 0 10.4 5.2 5.2 0 0 1 0-10.4zM7.15 4.35h1.7v1.7h-1.7zm0 2.65h1.7v4.55h-1.7z"
            />
          </svg>
        </span>
      </div>
      {tip
        ? createPortal(
            <span
              className="sticky-field__tip"
              role="tooltip"
              style={{ top: tip.top, left: tip.left, width: tip.width }}
            >
              {field.description}
            </span>,
            document.body,
          )
        : null}
    </li>
  );
}

function FieldRows({ fields }: { fields: StickyField[] }) {
  return (
    <ul>
      {fields.map((field) => (
        <StickyFieldRow key={field.name} field={field} />
      ))}
    </ul>
  );
}

function StickyFields({ fields, label = "Fields" }: { fields: StickyField[]; label?: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <details
      className="sticky-fields"
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
      onClick={stopCardClick}
      onDoubleClick={stopCardClick}
    >
      <summary>{label}</summary>
      <div className="sticky-fields__panel">
        <FieldRows fields={fields} />
      </div>
    </details>
  );
}

function StickyApiClientResponse({ cases }: { cases: StickyApiCase[] }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <details
      className="sticky-fields sticky-fields--api"
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
      onClick={stopCardClick}
      onDoubleClick={stopCardClick}
    >
      <summary>API Client Response</summary>
      <div className="sticky-fields__panel">
        <div className="sticky-api-cases">
          {cases.map((responseCase) => (
            <details
              key={responseCase.label}
              className="sticky-api-case"
              onClick={stopCardClick}
              onDoubleClick={stopCardClick}
            >
              <summary>{responseCase.label}</summary>
              <div className="sticky-fields__panel sticky-fields__panel--nested">
                <FieldRows fields={responseCase.fields} />
              </div>
            </details>
          ))}
        </div>
      </div>
    </details>
  );
}

function StickySections({
  fields,
  apiClientResponse,
}: {
  fields?: StickyField[];
  apiClientResponse?: StickyApiCase[];
}) {
  const hasFields = Boolean(fields && fields.length > 0);
  const hasApi = Boolean(apiClientResponse && apiClientResponse.length > 0);
  if (!hasFields && !hasApi) return null;
  return (
    <div className="sticky-sections">
      {hasFields ? <StickyFields fields={fields!} /> : null}
      {hasApi ? <StickyApiClientResponse cases={apiClientResponse!} /> : null}
    </div>
  );
}

function StickyNodeComponent({ id, data }: NodeProps) {
  const d = data as StickyData;
  const tier = d.displayTier ?? "full";
  const showRing = Boolean(d.isFocusAnchor && tier !== "hidden");

  const stickyRef = useRef<HTMLDivElement>(null);
  const onMeasuredSizeRef = useRef(d.onMeasuredSize);
  onMeasuredSizeRef.current = d.onMeasuredSize;
  const [ringSize, setRingSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const el = stickyRef.current;
    if (!el) return;

    const update = () => {
      const width = el.offsetWidth;
      const height = el.offsetHeight;
      setRingSize((prev) =>
        showRing && (prev.w !== width || prev.h !== height) ? { w: width, h: height } : showRing ? prev : { w: 0, h: 0 },
      );
      onMeasuredSizeRef.current?.(id, { width, height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [id, showRing]);

  const wrapClass = ["sticky-wrap", d.kind, showRing ? "sticky-wrap--focus-anchor" : ""]
    .filter(Boolean)
    .join(" ");

  const classNames = ["sticky", d.kind];
  if ((d.onWorkflowRoute || d.selected) && tier !== "hidden") classNames.push("sticky--workflow-route");
  if (tier === "hidden") classNames.push("sticky--hidden");
  if (tier === "context") classNames.push("sticky--context");
  if (tier === "preview") classNames.push("sticky--preview", `sticky--preview-${d.previewPhase ?? "idle"}`);
  if (d.external) classNames.push("sticky--external");

  const ringW = ringSize.w - RING_INSET * 2;
  const ringH = ringSize.h - RING_INSET * 2;
  const parentsLabel = d.parents?.length ? formatParentsLabel(d.parents) : null;

  return (
    <div className={wrapClass}>
      <div ref={stickyRef} className={classNames.join(" ")}>
        <Handle id="t-in" type="target" position={Position.Top} />
        <Handle id="t-out" type="source" position={Position.Top} />
        <Handle id="b-in" type="target" position={Position.Bottom} />
        <Handle id="b-out" type="source" position={Position.Bottom} />
        <Handle id="l-in" type="target" position={Position.Left} />
        <Handle id="r-out" type="source" position={Position.Right} />
        {d.timelineEvent ? (
          <div className="sticky-stream">{d.streamTitle}</div>
        ) : (
          <div className="kind">
            {d.kind === "automation" ? (
              <svg className="kind-gear" viewBox="0 0 24 24" aria-hidden>
                <path
                  fill="currentColor"
                  d="M19.4 13.5a7.7 7.7 0 0 0 .1-1.5 7.7 7.7 0 0 0-.1-1.5l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-2.6-1.5l-.4-2.6h-4l-.4 2.6a7.4 7.4 0 0 0-2.6 1.5l-2.4-1-2 3.4 2 1.6a7.7 7.7 0 0 0-.1 1.5 7.7 7.7 0 0 0 .1 1.5l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 0 0 2.6 1.5l.4 2.6h4l.4-2.6a7.4 7.4 0 0 0 2.6-1.5l2.4 1 2-3.4-2-1.6ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z"
                />
              </svg>
            ) : (
              d.kind
            )}
          </div>
        )}
        <div className="name">{d.name}</div>
        {d.external ? <div className="sticky-external-badge">External</div> : null}
        {parentsLabel ? <div className="sticky-parents">{parentsLabel}</div> : null}
        {!d.timelineEvent && d.subtitle ? <div className="sticky-subtitle">{d.subtitle}</div> : null}
        <StickySections fields={d.fields} apiClientResponse={d.apiClientResponse} />
      </div>
      {showRing && ringSize.w > 0 && ringSize.h > 0 && ringW > 0 && ringH > 0 ? (
        <svg
          className="sticky-focus-ring"
          width={ringSize.w}
          height={ringSize.h}
          aria-hidden
        >
          <rect
            className="sticky-focus-ring__rect"
            x={RING_INSET}
            y={RING_INSET}
            width={ringW}
            height={ringH}
            rx={RING_RX}
            ry={RING_RX}
            vectorEffect="nonScalingStroke"
          />
        </svg>
      ) : null}
    </div>
  );
}

export const StickyNode = memo(StickyNodeComponent);
