import { useEffect, useMemo, useRef, useState } from "react";
import type { NodePosition } from "./layoutMetrics.js";

export const LAYOUT_MORPH_MS = 480;
const DEFAULT_MS = LAYOUT_MORPH_MS;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function lerpPositions(
  from: Map<string, NodePosition>,
  to: Map<string, NodePosition>,
  t: number,
): Map<string, NodePosition> {
  const out = new Map<string, NodePosition>();
  const ids = new Set([...from.keys(), ...to.keys()]);
  for (const id of ids) {
    const a = from.get(id);
    const b = to.get(id) ?? a;
    if (!b) continue;
    if (!a) {
      out.set(id, b);
      continue;
    }
    out.set(id, {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
    });
  }
  return out;
}

function mapsEqual(a: Map<string, NodePosition>, b: Map<string, NodePosition>): boolean {
  if (a.size !== b.size) return false;
  for (const [id, p] of a) {
    const q = b.get(id);
    if (!q || q.x !== p.x || q.y !== p.y) return false;
  }
  return true;
}

function positionsKey(m: Map<string, NodePosition>): string {
  return [...m.entries()]
    .map(([id, p]) => `${id}:${p.x},${p.y}`)
    .sort()
    .join("|");
}

export type LayoutMorphState = {
  positions: Map<string, NodePosition>;
  isMorphing: boolean;
};

export function useLayoutMorph(
  target: Map<string, NodePosition>,
  durationMs = DEFAULT_MS,
): LayoutMorphState {
  const [display, setDisplay] = useState(target);
  const [isMorphing, setIsMorphing] = useState(false);
  const committed = useRef(target);
  const displayRef = useRef(display);
  displayRef.current = display;
  const targetRef = useRef(target);
  targetRef.current = target;
  const targetKey = useMemo(() => positionsKey(target), [target]);

  useEffect(() => {
    const next = targetRef.current;
    if (mapsEqual(committed.current, next)) {
      setIsMorphing(false);
      if (!mapsEqual(displayRef.current, next)) setDisplay(next);
      return;
    }

    const from = displayRef.current;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || durationMs <= 0) {
      committed.current = next;
      setDisplay(next);
      setIsMorphing(false);
      return;
    }

    setIsMorphing(true);
    let start: number | null = null;
    let raf = 0;
    let cancelled = false;

    const tick = (now: number) => {
      if (cancelled) return;
      if (start === null) start = now;
      const raw = Math.min(1, (now - start) / durationMs);
      const t = easeOutCubic(raw);
      setDisplay(lerpPositions(from, next, t));
      if (raw < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        committed.current = next;
        setDisplay(next);
        setIsMorphing(false);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [targetKey, durationMs]);

  return { positions: display, isMorphing };
}
