import { memo, useLayoutEffect, useRef, useState, type SyntheticEvent } from "react";
import { createPortal } from "react-dom";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  AppWindow,
  Circle,
  Cog,
  Globe,
  MousePointer2,
  Smartphone,
  SquareArrowOutUpRight,
} from "lucide-react";
import type { DisplayTier } from "./viewMode";

export type TriggerFieldCategory = "presented" | "collected" | "metadata";

export type StickyField = {
  name: string;
  type: string;
  description: string;
  category?: TriggerFieldCategory;
};

const TRIGGER_FIELD_GROUP_ORDER: TriggerFieldCategory[] = ["presented", "collected", "metadata"];

const TRIGGER_FIELD_GROUP_LABEL: Record<TriggerFieldCategory, string> = {
  presented: "Data Presented",
  collected: "Data Collected",
  metadata: "Metadata",
};

export function formatTriggerFieldGroupLabel(category: TriggerFieldCategory): string {
  return TRIGGER_FIELD_GROUP_LABEL[category];
}

/** Trigger fields grouped for display. Uncategorized fields stay under Fields. */
export function groupTriggerFields(
  fields: StickyField[],
): { label: string; fields: StickyField[] }[] {
  const groups = TRIGGER_FIELD_GROUP_ORDER.flatMap((category) => {
    const grouped = fields.filter((field) => field.category === category);
    return grouped.length
      ? [{ label: formatTriggerFieldGroupLabel(category), fields: grouped }]
      : [];
  });
  const uncategorized = fields.filter((field) => !field.category);
  if (uncategorized.length) groups.push({ label: "Fields", fields: uncategorized });
  return groups;
}

export type StickyApiCase = {
  label: string;
  fields: StickyField[];
};

export type StickyData = {
  kind: string;
  name: string;
  subtitle?: string;
  /**
   * Swim-lane / stream label (Who: for actor lanes; Context: for command/event streams).
   * Always rendered above the fields divider when present.
   */
  laneLabel?: string;
  /**
   * Data tables only: For: (consumer) under the name.
   */
  whoLabel?: string;
  contextLabel?: string;
  /** Command/event: "Stream:" subtag under the name. */
  streamTag?: string;
  fields?: StickyField[];
  /** Timeline: success/error shapes from an API client (command or automation). */
  apiClientResponse?: StickyApiCase[];
  /** Automation: outside system called, shown as External: under the section line. */
  externalName?: string;
  /** Report sticky box size so lane packing can clear expansions. */
  onMeasuredSize?: (nodeId: string, size: { width: number; height: number }) => void;
  isFocusAnchor?: boolean;
  onWorkflowRoute?: boolean;
  selected?: boolean;
  displayTier?: DisplayTier;
  previewPhase?: string;
  /** Outside the product boundary — drives External Web Page kind label (no separate badge). */
  external?: boolean;
  /** Auto-redirect URL trigger — drives Auto-Redirect URL kind label. */
  autoRedirect?: boolean;
  /** Screen/page names this control sits on; grouped with kind in the sticky header band. */
  parents?: string[];
};

/** Automation line under the section divider. Not a Who. */
export function formatExternalLabel(name: string): string {
  return `External: ${name}`;
}

/** Display label for sticky parent pages (prefix "Location"); singular for one, comma-separated for many. */
export function formatParentsLabel(parents: string[]): string | null {
  if (parents.length === 0) return null;
  const prefix = parents.length === 1 ? "Location" : "Locations";
  return `${prefix}: ${parents.join(", ")}`;
}

/** Object-type name shown with the sticky color code (non-UI kinds). */
export function formatKindLabel(kind: string): string {
  switch (kind) {
    case "dataTable":
      return "Data Table";
    case "event":
      return "Event";
    case "command":
      return "Command";
    case "trigger":
      return "Trigger";
    case "screen":
      return "Screen";
    case "automation":
      return "Automation";
    default:
      return kind;
  }
}

export type StickyKindSource = {
  kind: string;
  name: string;
  external?: boolean;
  autoRedirect?: boolean;
  parents?: string[];
};

function isMobileUiName(name: string): boolean {
  return /^Mobile\b/i.test(name.trim());
}

/**
 * UI-band category for screen / trigger / automation stickies.
 * Singular taxonomy: web page, mobile app screen, webpage components, element on mobile, external web page,
 * auto-redirect URL, automation.
 */
export function formatUiCategoryLabel(source: StickyKindSource): string | undefined {
  const { kind, name, external, autoRedirect, parents } = source;
  if (kind === "automation") return "Automation";
  if (kind === "screen") {
    return isMobileUiName(name) ? "Mobile App Screen" : "Web Page";
  }
  if (kind === "trigger") {
    if (external) return "External Web Page";
    if (autoRedirect) return "Auto-Redirect URL";
    if (parents && parents.length > 0) {
      const onMobile =
        isMobileUiName(name) || parents.every((p) => isMobileUiName(p));
      return onMobile ? "Element On Mobile App" : "webpage components";
    }
    return "Web Page";
  }
  return undefined;
}

/** Kind line on a sticky: UI category when applicable, else schema type name. */
export function formatStickyKindLabel(source: StickyKindSource): string {
  return formatUiCategoryLabel(source) ?? formatKindLabel(source.kind);
}

/**
 * Icon key for UI-band stickies (screens, triggers, automations).
 * Auto-Redirect URLs split success vs failure by name so each is recognizable.
 */
export type UiKindIconKey =
  | "automation"
  | "externalWebPage"
  | "autoRedirect"
  | "componentInWebPage"
  | "elementOnMobile"
  | "webPage"
  | "mobileAppScreen";

export function resolveUiKindIconKey(source: StickyKindSource): UiKindIconKey | null {
  const category = formatUiCategoryLabel(source);
  if (!category) return null;
  switch (category) {
    case "Automation":
      return "automation";
    case "External Web Page":
      return "externalWebPage";
    case "Auto-Redirect URL":
      return "autoRedirect";
    case "webpage components":
      return "componentInWebPage";
    case "Element On Mobile App":
      return "elementOnMobile";
    case "Web Page":
      return "webPage";
    case "Mobile App Screen":
      return "mobileAppScreen";
    default:
      return null;
  }
}

/** Lucide icon names used for each UI kind (for docs/tests). */
export const UI_KIND_LUCIDE_ICONS: Record<UiKindIconKey, string> = {
  automation: "Cog",
  externalWebPage: "Globe",
  /** Outbound corner arrow — shared by success and failure auto-redirect URLs. */
  autoRedirect: "SquareArrowOutUpRight",
  componentInWebPage: "MousePointer2",
  elementOnMobile: "Smartphone + Circle",
  webPage: "AppWindow",
  mobileAppScreen: "Smartphone",
};

const ICON_SIZE = 14;
const ICON_STROKE = 2;

/** Lucide SVG mark next to the kind label — official icon set paths. */
function KindIcon({ iconKey }: { iconKey: UiKindIconKey }) {
  const props = {
    className: "kind-icon",
    size: ICON_SIZE,
    strokeWidth: ICON_STROKE,
    "aria-hidden": true as const,
  };
  switch (iconKey) {
    case "automation":
      return <Cog {...props} />;
    case "externalWebPage":
      return <Globe {...props} />;
    case "autoRedirect":
      return <SquareArrowOutUpRight {...props} />;
    case "componentInWebPage":
      return <MousePointer2 {...props} />;
    case "elementOnMobile":
      return (
        <span className="kind-icon-combo" aria-hidden>
          <Smartphone {...props} />
          <Circle className="kind-icon kind-icon--tap" size={7} strokeWidth={2.5} />
        </span>
      );
    case "webPage":
      return <AppWindow {...props} />;
    case "mobileAppScreen":
      return <Smartphone {...props} />;
  }
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
      <summary>{TRIGGER_FIELD_GROUP_LABEL.collected}</summary>
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
  kind,
  fields,
  apiClientResponse,
  whoLabel,
  externalLabel,
}: {
  kind?: string;
  fields?: StickyField[];
  apiClientResponse?: StickyApiCase[];
  /** Triggers: Who sits under the section divider, above the field groups. */
  whoLabel?: string;
  /** Automations: External sits under the section divider, above the API response. */
  externalLabel?: string;
}) {
  const presentedFields =
    kind === "automation" ? (fields ?? []).filter((field) => field.category === "presented") : [];
  const groupedFields =
    kind === "automation" ? (fields ?? []).filter((field) => field.category !== "presented") : fields;
  const fieldGroups =
    kind === "trigger" && groupedFields?.length
      ? groupTriggerFields(groupedFields)
      : groupedFields?.length
        ? [{ label: "Fields", fields: groupedFields }]
        : [];
  const hasApi = Boolean(apiClientResponse && apiClientResponse.length > 0);
  const whoBelowLine = Boolean(kind === "trigger" && whoLabel);
  const externalBelowLine = Boolean(kind === "automation" && externalLabel);
  if (!fieldGroups.length && !hasApi && !whoBelowLine && !externalBelowLine && !presentedFields.length) {
    return null;
  }
  return (
    <div className="sticky-sections">
      {whoBelowLine ? <div className="sticky-parents sticky-who-below-line">{whoLabel}</div> : null}
      {externalBelowLine ? (
        <div className="sticky-parents sticky-who-below-line">{externalLabel}</div>
      ) : null}
      {presentedFields.length ? (
        <StickyFields fields={presentedFields} label={TRIGGER_FIELD_GROUP_LABEL.presented} />
      ) : null}
      {fieldGroups.map((group) => (
        <StickyFields key={group.label} fields={group.fields} label={group.label} />
      ))}
      {hasApi ? <StickyApiClientResponse cases={apiClientResponse!} /> : null}
    </div>
  );
}

/** Split "Location:" / "Locations:" / "For:" from the value so only the prefix is weak italic. */
function splitMetaPrefix(label: string): { prefix: string; value: string } | null {
  const match = /^(Locations?|For):\s*(.+)$/.exec(label);
  if (!match) return null;
  return { prefix: `${match[1]}:`, value: match[2] };
}

function MetaPrefixLine({ label, className }: { label: string; className: string }) {
  const parts = splitMetaPrefix(label);
  if (!parts) return <div className={className}>{label}</div>;
  return (
    <div className={className}>
      <span className="sticky-meta-prefix">{parts.prefix} </span>
      <span className="sticky-meta-value">{parts.value}</span>
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
  const ringW = ringSize.w - RING_INSET * 2;
  const ringH = ringSize.h - RING_INSET * 2;
  const parentsLabel = d.parents?.length ? formatParentsLabel(d.parents) : null;
  const externalLabel = d.externalName ? formatExternalLabel(d.externalName) : undefined;
  const hasSections = Boolean(
    (d.fields && d.fields.length > 0) ||
      (d.apiClientResponse && d.apiClientResponse.length > 0) ||
      externalLabel,
  );
  const kindIconKey = resolveUiKindIconKey(d);
  // Commands/events: Context: in header (quiet meta). Automations: Who in header
  // under the kind tag. Data tables: For: under the name. No Who line.
  // Triggers: Location in the header; Who under the section line. Screens: Who below the name.
  const contextInHeader = Boolean(
    d.laneLabel && (d.kind === "command" || d.kind === "event"),
  );
  const whoInHeader = Boolean(d.laneLabel && d.kind === "automation");
  const dataTableMetaBelow = Boolean(d.kind === "dataTable" && d.contextLabel);
  const isTriggerUi = d.kind === "trigger" || d.kind === "screen";
  const whoBelowLine = Boolean(d.kind === "trigger" && d.laneLabel);
  const whoBelowName = Boolean(
    d.laneLabel && !contextInHeader && !whoInHeader && !dataTableMetaBelow && !whoBelowLine,
  );
  // Automations show the actor name only — no "Who:" prefix (Location-like placement).
  const automationWhoLabel = whoInHeader
    ? d.laneLabel!.replace(/^Who:\s*/i, "")
    : null;
  const whoLaneClass = [
    isTriggerUi ? "sticky-parents" : "sticky-lane",
    whoBelowName && hasSections ? "sticky-lane--before-divider" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const parentsClass = isTriggerUi ? "sticky-trigger-location" : "sticky-parents";
  const dataTableMetaClass = [
    "sticky-data-table-meta",
    hasSections ? "sticky-data-table-meta--before-divider" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={wrapClass}>
      <div ref={stickyRef} className={classNames.join(" ")}>
        <Handle id="t-in" type="target" position={Position.Top} />
        <Handle id="t-out" type="source" position={Position.Top} />
        <Handle id="b-in" type="target" position={Position.Bottom} />
        <Handle id="b-out" type="source" position={Position.Bottom} />
        <Handle id="l-in" type="target" position={Position.Left} />
        <Handle id="l-out" type="source" position={Position.Left} />
        <Handle id="r-out" type="source" position={Position.Right} />
        {/* Kind + Context/Who/Location meta as one header band above the name. */}
        <div className="sticky-header">
          <div className="kind">
            {kindIconKey ? <KindIcon iconKey={kindIconKey} /> : null}
            {formatStickyKindLabel(d)}
          </div>
          {contextInHeader ? <div className="sticky-parents">{d.laneLabel}</div> : null}
          {automationWhoLabel ? <div className="sticky-lane">{automationWhoLabel}</div> : null}
          {parentsLabel ? (
            isTriggerUi ? (
              <MetaPrefixLine className={parentsClass} label={parentsLabel} />
            ) : (
              <div className={parentsClass}>{parentsLabel}</div>
            )
          ) : null}
        </div>
        <div className="name">{d.name}</div>
        {d.streamTag ? (
          <div className={dataTableMetaClass}>
            <div className="sticky-data-table-context">
              <span className="sticky-meta-prefix">Stream: </span>
              <span className="sticky-meta-value">{d.streamTag}</span>
            </div>
          </div>
        ) : null}
        {dataTableMetaBelow ? (
          <div className={dataTableMetaClass}>
            {d.contextLabel ? (
              <MetaPrefixLine className="sticky-data-table-context" label={d.contextLabel} />
            ) : null}
          </div>
        ) : null}
        {whoBelowName ? <div className={whoLaneClass}>{d.laneLabel}</div> : null}
        {!d.laneLabel && !dataTableMetaBelow && d.subtitle ? (
          <div className="sticky-subtitle">{d.subtitle}</div>
        ) : null}
        <StickySections
          kind={d.kind}
          fields={d.fields}
          apiClientResponse={d.apiClientResponse}
          whoLabel={whoBelowLine ? d.laneLabel : undefined}
          externalLabel={d.kind === "automation" ? externalLabel : undefined}
        />
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
