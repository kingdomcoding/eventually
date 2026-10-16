import { memo, useLayoutEffect, useRef, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { DisplayTier } from "./viewMode";

export type StickyData = {
  kind: string;
  name: string;
  subtitle?: string;
  isFocusAnchor?: boolean;
  displayTier?: DisplayTier;
  previewPhase?: string;
};

const RING_INSET = 1.25;
const RING_RX = 8;

function StickyNodeComponent({ data }: NodeProps) {
  const d = data as StickyData;
  const tier = d.displayTier ?? "full";
  const showRing = Boolean(d.isFocusAnchor && tier !== "hidden");

  const stickyRef = useRef<HTMLDivElement>(null);
  const [ringSize, setRingSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    if (!showRing) {
      setRingSize({ w: 0, h: 0 });
      return;
    }
    const el = stickyRef.current;
    if (!el) return;

    const update = () => {
      setRingSize({ w: el.offsetWidth, h: el.offsetHeight });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [showRing, tier, d.name, d.subtitle]);

  const wrapClass = ["sticky-wrap", d.kind, showRing ? "sticky-wrap--focus-anchor" : ""]
    .filter(Boolean)
    .join(" ");

  const classNames = ["sticky", d.kind];
  if (tier === "hidden") classNames.push("sticky--hidden");
  if (tier === "context") classNames.push("sticky--context");
  if (tier === "preview") classNames.push("sticky--preview", `sticky--preview-${d.previewPhase ?? "idle"}`);

  const ringW = ringSize.w - RING_INSET * 2;
  const ringH = ringSize.h - RING_INSET * 2;

  return (
    <div className={wrapClass}>
      <div ref={stickyRef} className={classNames.join(" ")}>
        <Handle id="t-in" type="target" position={Position.Top} />
        <Handle id="t-out" type="source" position={Position.Top} />
        <Handle id="b-in" type="target" position={Position.Bottom} />
        <Handle id="b-out" type="source" position={Position.Bottom} />
        <Handle id="l-in" type="target" position={Position.Left} />
        <Handle id="r-out" type="source" position={Position.Right} />
        <div className="kind">{d.kind}</div>
        <div className="name">{d.name}</div>
        {d.subtitle ? <div style={{ opacity: 0.75, marginTop: 4 }}>{d.subtitle}</div> : null}
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
