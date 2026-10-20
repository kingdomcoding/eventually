import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { WorkflowEventOption, WorkflowPathResult } from "./workflowPath.js";

function eventLabel(opt: WorkflowEventOption): string {
  return opt.label;
}

function resolveEventId(query: string, options: WorkflowEventOption[]): string | null {
  const trimmed = query.trim();
  if (!trimmed) return null;
  const byId = options.find((o) => o.id === trimmed);
  if (byId) return byId.id;
  const lower = trimmed.toLowerCase();
  const byName = options.filter((o) => o.name.toLowerCase() === lower);
  if (byName.length === 1) return byName[0]!.id;
  const prefix = options.filter((o) => o.name.toLowerCase().startsWith(lower));
  if (prefix.length === 1) return prefix[0]!.id;
  return null;
}

type EventFieldProps = {
  label: string;
  placeholder: string;
  options: WorkflowEventOption[];
  valueId: string | null;
  onPick: (eventId: string) => void;
};

function EventSearchField({ label, placeholder, options, valueId, onPick }: EventFieldProps) {
  const selected = options.find((o) => o.id === valueId);
  const [query, setQuery] = useState(selected ? eventLabel(selected) : "");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sel = options.find((o) => o.id === valueId);
    setQuery(sel ? eventLabel(sel) : "");
  }, [valueId, options]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.name.toLowerCase().includes(q) ||
        o.id.toLowerCase().includes(q),
    );
  }, [options, query]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const commitQuery = useCallback(() => {
    const id = resolveEventId(query, options);
    if (id) {
      onPick(id);
      const opt = options.find((o) => o.id === id);
      setQuery(opt ? eventLabel(opt) : query);
    } else if (valueId) {
      const sel = options.find((o) => o.id === valueId);
      if (sel) setQuery(eventLabel(sel));
    }
    setOpen(false);
  }, [onPick, options, query, valueId]);

  return (
    <div className="workflow-field" ref={wrapRef}>
      <label className="workflow-field__label">{label}</label>
      <input
        className="workflow-field__input"
        type="search"
        placeholder={placeholder}
        value={query}
        autoComplete="off"
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commitQuery();
          }
          if (e.key === "Escape") setOpen(false);
        }}
        onBlur={() => {
          window.setTimeout(commitQuery, 120);
        }}
      />
      {open && filtered.length > 0 ? (
        <ul className="workflow-field__list" role="listbox">
          {filtered.slice(0, 12).map((opt) => (
            <li key={opt.id}>
              <button
                type="button"
                role="option"
                className="workflow-field__option"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(opt.id);
                  setQuery(eventLabel(opt));
                  setOpen(false);
                }}
              >
                <span className="workflow-field__option-name">{opt.label}</span>
                <span className="workflow-field__option-meta">{opt.id}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export type WorkflowRouteBarProps = {
  options: WorkflowEventOption[];
  fromEventId: string | null;
  toEventId: string | null;
  path: WorkflowPathResult;
  onSetFrom: (eventId: string | null) => void;
  onSetTo: (eventId: string | null) => void;
  onClear: () => void;
};

function WorkflowRouteBarComponent({
  options,
  fromEventId,
  toEventId,
  path,
  onSetFrom,
  onSetTo,
  onClear,
}: WorkflowRouteBarProps) {
  const pickFrom = useCallback((id: string) => onSetFrom(id), [onSetFrom]);
  const pickTo = useCallback((id: string) => onSetTo(id), [onSetTo]);

  const routeActive = fromEventId && toEventId;
  const statusLine = useMemo(() => {
    if (!routeActive) return "Set start and end events to highlight a then-chain on the map.";
    if (path.status === "valid") {
      return `Route — ${path.eventIds.size} event${path.eventIds.size === 1 ? "" : "s"} on then-chain (all branches included)`;
    }
    if (path.status === "invalid") return path.message;
    return "";
  }, [path, routeActive]);

  return (
    <section className="workflow-bar" aria-label="Workflow route">
      <div className="workflow-bar__fields">
        <EventSearchField
          label="From"
          placeholder="Start event…"
          options={options}
          valueId={fromEventId}
          onPick={pickFrom}
        />
        <span className="workflow-bar__arrow" aria-hidden>
          →
        </span>
        <EventSearchField
          label="To"
          placeholder="End event…"
          options={options}
          valueId={toEventId}
          onPick={pickTo}
        />
      </div>
      <div className="workflow-bar__status">
        <p
          className={`workflow-bar__message${path.status === "invalid" ? " workflow-bar__message--error" : ""}`}
        >
          {statusLine}
        </p>
        {routeActive ? (
          <button type="button" className="workflow-bar__clear" onClick={onClear}>
            Clear route
          </button>
        ) : null}
      </div>
    </section>
  );
}

export const WorkflowRouteBar = memo(WorkflowRouteBarComponent);
