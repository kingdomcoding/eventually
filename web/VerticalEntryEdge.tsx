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
 * Same Bezier handle routing as the board default, with a deeper stub on the
 * target side so the shaft enters the arrowhead along the handle normal
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
      markerEnd={markerEnd}
      style={style}
      interactionWidth={interactionWidth}
    />
  );
}
