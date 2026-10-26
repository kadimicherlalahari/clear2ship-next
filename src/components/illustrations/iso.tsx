// A tiny isometric drawing kit: prisms projected at 30°, drawn back-to-front, with flat "decals"
// (doors, stripes, windows) placed on a prism face. Scenes are composed from these parts.
import type { ReactNode, SVGProps } from "react";

const C = Math.cos(Math.PI / 6);
const S = 0.5;
export const INK = "#151412";
const STROKE = { stroke: INK, strokeWidth: 1.4, strokeLinejoin: "round" as const };

export type Pt = [number, number, number];
const proj = ([x, y, z]: Pt): [number, number] => [(x - y) * C, (x + y) * S - z];
const pts = (list: Pt[]) => list.map((p) => proj(p).map((n) => n.toFixed(2)).join(",")).join(" ");

export type Prism = {
  x: number; y: number; z: number; w: number; d: number; h: number;
  top: string; left: string; right: string;
  decals?: Decal[];
  key?: string;
};
export type Face = "top" | "left" | "right";
/** A quad on one face; u/v are in the face's own units (left: x by z, right: y by z, top: x by y). */
export type Decal = { face: Face; u0: number; u1: number; v0: number; v1: number; fill: string; stroke?: boolean; opacity?: number };

function faceQuad(p: Prism, f: Face, u0: number, u1: number, v0: number, v1: number): Pt[] {
  if (f === "left") return [[p.x + u0, p.y + p.d, p.z + v0], [p.x + u1, p.y + p.d, p.z + v0], [p.x + u1, p.y + p.d, p.z + v1], [p.x + u0, p.y + p.d, p.z + v1]];
  if (f === "right") return [[p.x + p.w, p.y + u0, p.z + v0], [p.x + p.w, p.y + u1, p.z + v0], [p.x + p.w, p.y + u1, p.z + v1], [p.x + p.w, p.y + u0, p.z + v1]];
  const z = p.z + p.h;
  return [[p.x + u0, p.y + v0, z], [p.x + u1, p.y + v0, z], [p.x + u1, p.y + v1, z], [p.x + u0, p.y + v1, z]];
}

export function PrismShape({ p }: { p: Prism }) {
  const { x, y, z, w, d, h } = p;
  return (
    <g>
      <polygon points={pts([[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]])} fill={p.left} {...STROKE} />
      <polygon points={pts([[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]])} fill={p.right} {...STROKE} />
      <polygon points={pts([[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]])} fill={p.top} {...STROKE} />
      {p.decals?.map((dc, i) => (
        <polygon key={i} points={pts(faceQuad(p, dc.face, dc.u0, dc.u1, dc.v0, dc.v1))} fill={dc.fill} opacity={dc.opacity}
          {...(dc.stroke === false ? {} : { ...STROKE, strokeWidth: 1 })} />
      ))}
    </g>
  );
}

/** Draw prisms back-to-front (painter's order on the isometric depth axis). */
export function IsoGroup({ prisms }: { prisms: Prism[] }) {
  const sorted = [...prisms].sort((a, b) => (a.x + a.w / 2 + a.y + a.d / 2 + a.z) - (b.x + b.w / 2 + b.y + b.d / 2 + b.z));
  return <>{sorted.map((p, i) => <PrismShape key={p.key ?? i} p={p} />)}</>;
}

// ---------------------------------------------------------------- parts

export const kraft = { top: "#ecc493", left: "#d9a46a", right: "#b97f45" };
const white = { top: "#ffffff", left: "#f1eee9", right: "#ddd7cf" };
const ink = { top: "#3a3632", left: "#262320", right: "#151412" };
const orange = { top: "#ff8a52", left: "#ff5a1f", right: "#d9460f" };
const wood = { top: "#e8c79a", left: "#cfa36d", right: "#a97c48" };
const concrete = { top: "#e6e1d9", left: "#d3ccc1", right: "#bdb5a8" };

export function box(x: number, y: number, z: number, s = 16, key?: string): Prism {
  return {
    key, x, y, z, w: s, d: s, h: s * 0.85, ...kraft,
    decals: [
      { face: "top", u0: s * 0.42, u1: s * 0.58, v0: 0, v1: s, fill: "#c98d52", stroke: false },
      { face: "left", u0: s * 0.42, u1: s * 0.58, v0: s * 0.55, v1: s * 0.85, fill: "#c98d52", stroke: false },
      { face: "left", u0: s * 0.12, u1: s * 0.32, v0: s * 0.12, v1: s * 0.3, fill: "#ffffff", stroke: false, opacity: 0.85 },
    ],
  };
}

export function pallet(x: number, y: number, z = 0, w = 34, d = 34): Prism[] {
  return [
    { x, y, z, w, d, h: 2, ...wood },
    { x, y, z: z + 2, w: 4, d, h: 3, ...wood },
    { x: x + w / 2 - 2, y, z: z + 2, w: 4, d, h: 3, ...wood },
    { x: x + w - 4, y, z: z + 2, w: 4, d, h: 3, ...wood },
    { x, y, z: z + 5, w, d, h: 2, ...wood },
  ];
}

/** A white van facing +x: cargo box, cab, orange stripe, windscreen; wheels are drawn separately. */
export function van(x: number, y: number, z = 0): Prism[] {
  return [
    {
      x, y, z: z + 6, w: 54, d: 24, h: 26, ...white,
      decals: [
        { face: "left", u0: 0, u1: 54, v0: 9, v1: 13, fill: "#ff5a1f", stroke: false },
      ],
    },
    {
      x: x + 54, y, z: z + 6, w: 16, d: 24, h: 19, ...white,
      decals: [
        { face: "right", u0: 3, u1: 21, v0: 9, v1: 17, fill: "#2a3a46" },
        { face: "left", u0: 2, u1: 12, v0: 9, v1: 16, fill: "#2a3a46" },
        { face: "right", u0: 2, u1: 6, v0: 3, v1: 6, fill: "#ffd166", stroke: false },
        { face: "right", u0: 18, u1: 22, v0: 3, v1: 6, fill: "#ffd166", stroke: false },
      ],
    },
  ];
}
export function VanWheels({ x, y, z = 0 }: { x: number; y: number; z?: number }) {
  return (
    <g>
      {[[x + 12, y + 24], [x + 58, y + 24]].map(([wx, wy], i) => {
        const [cx, cy] = proj([wx, wy, z + 5]);
        return <ellipse key={i} cx={cx} cy={cy} rx={5.5} ry={6.5} fill={INK} stroke={INK} transform={`rotate(-30 ${cx} ${cy})`} />;
      })}
    </g>
  );
}

/** Text painted on a prism's front-left face (the plane y = const), following the face's angle. */
export function FaceText({ x, y, z, size, children, fill = INK }: { x: number; y: number; z: number; size: number; children: string; fill?: string }) {
  const [ox, oy] = proj([x, y, z]);
  return (
    <text transform={`matrix(${C} ${S} 0 1 ${ox.toFixed(2)} ${oy.toFixed(2)})`} fontSize={size} fontWeight={800}
      fontFamily="var(--font-archivo), sans-serif" fill={fill} style={{ fontStretch: "115%" }} aria-hidden>
      {children}
    </text>
  );
}

/** The wordmark on a van's side (call after drawing van(x, y, z)). */
export function VanLogo({ x, y, z = 0 }: { x: number; y: number; z?: number }) {
  return (
    <FaceText x={x + 5} y={y + 24} z={z + 6 + 17} size={7.5}>
      clear2ship.
    </FaceText>
  );
}

/** The wordmark on a depot's front-left wall (same x, y, w, d, h as depot()). */
export function DepotLogo({ x, y, w = 110, d = 80, h = 70 }: { x: number; y: number; w?: number; d?: number; h?: number }) {
  return (
    <FaceText x={x + w * 0.1} y={y + d} z={h * 0.34} size={Math.round(w / 7.5)}>
      clear2ship.
    </FaceText>
  );
}

export function depot(x: number, y: number, w = 110, d = 80, h = 70): Prism[] {
  return [
    {
      x, y, z: 0, w, d, h, ...white,
      decals: [
        // roller door with an orange glow behind, on the front-right face
        { face: "right", u0: d * 0.28, u1: d * 0.82, v0: 0, v1: h * 0.62, fill: "#ff5a1f" },
        { face: "right", u0: d * 0.32, u1: d * 0.78, v0: h * 0.3, v1: h * 0.58, fill: "#ffb48a", stroke: false },
        { face: "left", u0: w * 0.1, u1: w * 0.34, v0: h * 0.5, v1: h * 0.72, fill: "#2a3a46" },
        { face: "left", u0: w * 0.42, u1: w * 0.66, v0: h * 0.5, v1: h * 0.72, fill: "#2a3a46" },
      ],
    },
    { x: x - 2, y: y - 2, z: h, w: w + 4, d: d + 4, h: 5, ...ink },
    // orange sign panel standing on the roof
    { x: x + w * 0.55, y: y + 6, z: h + 5, w: 6, d: d * 0.55, h: 26, ...orange },
  ];
}

export function conveyor(x: number, y: number, len = 120, z = 10): Prism[] {
  return [
    { x, y, z, w: len, d: 16, h: 4, top: "#4a4540", left: "#2c2925", right: "#1c1a18" },
    { x: x + 8, y: y + 2, z: 0, w: 4, d: 12, h: z, ...concrete },
    { x: x + len - 14, y: y + 2, z: 0, w: 4, d: 12, h: z, ...concrete },
  ];
}
/** Moving belt lines on a conveyor top. */
export function BeltLines({ x, y, len = 120, z = 14 }: { x: number; y: number; len?: number; z?: number }) {
  const a = proj([x + 2, y + 8, z]);
  const b = proj([x + len - 2, y + 8, z]);
  return <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#8c847b" strokeWidth={1.5} strokeDasharray="6 6" className="iso-belt" />;
}

export function road(x: number, y: number, len = 260, d = 40): Prism {
  return {
    x, y, z: -3, w: len, d, h: 3, top: "#d9d3ca", left: "#c4bcb0", right: "#aea597",
    decals: Array.from({ length: Math.floor(len / 30) }, (_, i) => ({
      face: "top" as const, u0: i * 30 + 6, u1: i * 30 + 20, v0: d / 2 - 1.5, v1: d / 2 + 1.5, fill: "#ff5a1f", stroke: false,
    })),
  };
}

/** A small tree in a low planter. */
export function Tree({ x, y, z = 0, r = 13 }: { x: number; y: number; z?: number; r?: number }) {
  const [cx, cy] = proj([x + 7, y + 7, z + 6]);
  return (
    <g>
      <line x1={cx} y1={cy} x2={cx} y2={cy - r - 6} stroke={INK} strokeWidth={2} strokeLinecap="round" />
      <PrismShape p={{ x, y, z, w: 14, d: 14, h: 6, top: "#6f675d", left: "#e6e1d9", right: "#cfc8bc" }} />
      <circle cx={cx} cy={cy - r - 8} r={r} fill="#8fb07a" stroke={INK} strokeWidth={1.4} />
      <circle cx={cx - r * 0.3} cy={cy - r - 11} r={r * 0.42} fill="#a9c792" />
    </g>
  );
}

export function IsoSvg({ children, viewBox, label, ...rest }: { children: ReactNode; viewBox: string; label: string } & SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox={viewBox} role="img" aria-label={label} {...rest}>
      {children}
    </svg>
  );
}

export { proj };
