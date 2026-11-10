import { BaseEdge, Position, type EdgeProps } from "@xyflow/react";

/** Outward along the handle normal (away from the node). */
function outward(
  pos: Position,
  x: number,
  y: number,
  depth: number,
): [number, number] {
  switch (pos) {
    case Position.Left:
      return [x - depth, y];
    case Position.Right:
      return [x + depth, y];
    case Position.Top:
      return [x, y - depth];
    case Position.Bottom:
      return [x, y + depth];
  }
}

/**
 * Redirect path: leave source right, snap upward early, cruise above stickies,
 * then drop into the target top. Horizontal run stays clear of sticky tops.
 */
export function getRedirectClearPath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
): [path: string, labelX: number, labelY: number] {
  const span = Math.abs(targetX - sourceX) || 1;
  // sourceY is mid-height on the right handle; lift clear of both sticky tops.
  const sourceTopApprox = sourceY - 40;
  const clearance = 48 + Math.min(40, span * 0.04);
  const apexY = Math.min(sourceTopApprox, targetY) - clearance;
  // Tiny right stub, then a hard early rise — peak reached close to the source.
  const exitStub = 10;
  const earlyRiseX = sourceX + Math.max(28, Math.min(56, span * 0.12 + 24));
  const peakX = earlyRiseX + (targetX - earlyRiseX) * 0.45;

  const path =
    `M${sourceX},${sourceY}` +
    // Exit right briefly, then angulate up drastically to the apex near the source.
    ` C${sourceX + exitStub},${sourceY} ${sourceX + exitStub},${apexY} ${earlyRiseX},${apexY}` +
    // Cruise at peak height, then drop into the target top handle.
    ` C${peakX},${apexY} ${targetX},${apexY} ${targetX},${targetY}`;

  // "redirect" label at the highest point of the curve (apex peak).
  const labelX = peakX;
  const labelY = apexY;
  return [path, labelX, labelY];
}

/**
 * Same Bezier handle routing as the board default, with a deeper stub on the
 * target side so the shaft meets the arrowhead along the handle normal
 * (from below into bottom handles, from above into top handles, etc.).
 */
export function getVerticalEntryPath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  sourcePosition: Position = Position.Bottom,
  targetPosition: Position = Position.Top,
): [path: string, labelX: number, labelY: number] {
  // Redirects: right → top, routed clear of the sticky row.
  if (sourcePosition === Position.Right && targetPosition === Position.Top) {
    return getRedirectClearPath(sourceX, sourceY, targetX, targetY);
  }

  const span = Math.hypot(targetX - sourceX, targetY - sourceY) || 1;
  const exitDepth = Math.min(70, span * 0.35 + 36);
  // Deep enough that the final approach reads as a connected stub into the arrow.
  const entryDepth = Math.max(56, Math.min(120, span * 0.35 + 40));
  const [c1x, c1y] = outward(sourcePosition, sourceX, sourceY, exitDepth);
  const [c2x, c2y] = outward(targetPosition, targetX, targetY, entryDepth);
  return [
    `M${sourceX},${sourceY} C${c1x},${c1y} ${c2x},${c2y} ${targetX},${targetY}`,
    (sourceX + targetX) / 2,
    (sourceY + targetY) / 2,
  ];
}

export function VerticalEntryEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition = Position.Bottom,
  targetPosition = Position.Top,
  markerEnd,
  style,
  interactionWidth,
  label,
  labelStyle,
  labelShowBg,
  labelBgStyle,
  labelBgPadding,
  labelBgBorderRadius,
}: EdgeProps) {
  const [path, labelX, labelY] = getVerticalEntryPath(
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  );
  return (
    <BaseEdge
      id={id}
      path={path}
      labelX={labelX}
      labelY={labelY}
      label={label}
      labelStyle={labelStyle}
      labelShowBg={labelShowBg}
      labelBgStyle={labelBgStyle}
      labelBgPadding={labelBgPadding}
      labelBgBorderRadius={labelBgBorderRadius}
      markerEnd={markerEnd}
      style={style}
      interactionWidth={interactionWidth}
    />
  );
}
