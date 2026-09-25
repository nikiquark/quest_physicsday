import { useMemo } from "react";

import { markerCells } from "./marker";

interface Props {
  id: number;
  /** White quiet zone around the marker, in cells. Detection needs at least 1. */
  quietZone?: number;
  className?: string;
  style?: React.CSSProperties;
}

/** Crisp vector ArUco marker: black background with white cells, on a white quiet zone. */
export function MarkerSvg({ id, quietZone = 1, className, style }: Props) {
  const cells = useMemo(() => markerCells(id), [id]);
  const size = cells.length;
  const total = size + quietZone * 2;
  const path = useMemo(() => {
    let d = "";
    cells.forEach((row, y) =>
      row.forEach((white, x) => {
        if (white) d += `M${x + quietZone} ${y + quietZone}h1v1h-1z`;
      }),
    );
    return d;
  }, [cells, quietZone]);

  return (
    <svg
      viewBox={`0 0 ${total} ${total}`}
      className={className}
      style={style}
      shapeRendering="crispEdges"
      role="img"
      aria-label={`Маркер ${id}`}
    >
      <rect width={total} height={total} fill="#fff" />
      <rect x={quietZone} y={quietZone} width={size} height={size} fill="#000" />
      <path d={path} fill="#fff" />
    </svg>
  );
}
