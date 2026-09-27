/** Must match the viewBox below: pin coordinates are fractions of it. */
export const MAP_WIDTH = 1000;
export const MAP_HEIGHT = 550;

const FONT = "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";

/**
 * One floor of the building: an upside-down "П" drawn as an extruded block (top face + visible
 * side walls), the floor label in its opening, the entrance under the first floor.
 * Every floor uses the same shape and viewBox, so pins keep their place when switching floors.
 */
export function FloorPlan({ floor, className }: { floor: number; className?: string }) {
  return (
    <svg viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} className={className} role="img" aria-label={`${floor} этаж`}>
      <defs>
        <linearGradient id="floor-roof" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f7f8fb" />
          <stop offset="1" stopColor="#eef0f5" />
        </linearGradient>
      </defs>

      {/* 360 tall + 36 of visible walls: legs 0..160, crossbar 160..360 */}
      <g transform="translate(0 40)">
        <g stroke="#1c1c1c" strokeWidth="3" strokeLinejoin="round">
          <polygon points="330,0 352,36 352,196 330,160" fill="#c9cdd8" />
          <polygon points="900,0 922,36 922,396 900,360" fill="#c9cdd8" />
          <polygon points="100,360 900,360 922,396 122,396" fill="#dde0e8" />
        </g>
        <polygon
          points="100,0 330,0 330,160 670,160 670,0 900,0 900,360 100,360"
          fill="url(#floor-roof)"
          stroke="#1c1c1c"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <polyline points="215,30 215,260 785,260 785,30" stroke="#d5d8e1" strokeWidth="2" strokeDasharray="8 8" fill="none" />
        <text
          x="500"
          y="80"
          fontFamily={FONT}
          fontWeight="700"
          fontSize="40"
          fill="#111"
          textAnchor="middle"
          dominantBaseline="central"
        >
          {floor} этаж
        </text>
      </g>

      {floor === 1 && (
        <>
          <rect x="470" y="398" width="60" height="6" fill="#344ead" />
          <g fill="#344ead">
            <polygon points="500,448 486,468 514,468" />
            <rect x="496" y="466" width="8" height="18" />
          </g>
          <text x="500" y="520" textAnchor="middle" fontFamily={FONT} fontSize="30" fontWeight="700" fill="#111">
            Вход
          </text>
        </>
      )}
    </svg>
  );
}
