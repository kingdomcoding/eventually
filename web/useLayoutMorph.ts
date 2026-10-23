import { useEffect, useRef, useState } from "react";
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

  useEffect(() => {
    if (mapsEqual(committed.current, target)) {
      setIsMorphing(false);
      return;
    }

    const from = committed.current;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || durationMs <= 0) {
      committed.current = target;
      setDisplay(target);
      setIsMorphing(false);
      return;
    }

    setIsMorphing(true);
    let start: number | null = null;
    let raf = 0;

    const tick = (now: number) => {
      if (start === null) start = now;
      const raw = Math.min(1, (now - start) / durationMs);
      const t = easeOutCubic(raw);
      setDisplay(lerpPositions(from, target, t));
      if (raw < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        committed.current = target;
        setDisplay(target);
        setIsMorphing(false);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return { positions: display, isMorphing };
}
