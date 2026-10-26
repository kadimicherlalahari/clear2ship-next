// Four isometric scenes for the role home pages, drawn with the kit in iso.tsx.
import {
  BeltLines, box, conveyor, depot, DepotLogo, INK, IsoGroup, IsoSvg, pallet, PrismShape, proj, road, Tree, van, VanLogo, VanWheels, kraft,
} from "./iso";

/** Shadow under the whole scene so it sits on the page. */
function Ground({ cx, cy, rx, ry }: { cx: number; cy: number; rx: number; ry: number }) {
  return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#151412" opacity={0.045} />;
}

/** A van that drives along the road (paused for reduced motion). */
function DrivingVan({ x, y }: { x: number; y: number }) {
  return (
    <g className="iso-van">
      <IsoGroup prisms={van(x, y)} />
      <VanWheels x={x} y={y} />
      <VanLogo x={x} y={y} />
    </g>
  );
}

/** Seller: parcels leave the depot on a conveyor; a van heads off down the road. */
export function SellerScene({ className }: { className?: string }) {
  return (
    <IsoSvg viewBox="-175 -160 360 300" label="A depot sending parcels out on a conveyor to a waiting van" className={className}>
      <Ground cx={0} cy={40} rx={170} ry={62} />
      <PrismShape p={road(-70, 40, 240, 40)} />
      <IsoGroup prisms={[...depot(-75, -75, 105, 80, 66), ...conveyor(30, -36, 96)]} />
      <DepotLogo x={-75} y={-75} w={105} d={80} h={66} />
      <BeltLines x={30} y={-36} len={96} />
      <g className="iso-bob"><IsoGroup prisms={[box(48, -35, 14, 14, "b1")]} /></g>
      <g className="iso-bob" style={{ animationDelay: "-1.2s" }}><IsoGroup prisms={[box(88, -35, 14, 14, "b2")]} /></g>
      <IsoGroup prisms={[...pallet(118, -12), box(121, -9, 7, 14), box(137, -9, 7, 14), box(129, -2, 19, 14)]} />
      <Tree x={-118} y={-8} />
      <Tree x={150} y={-82} r={11} />
      <DrivingVan x={20} y={48} />
    </IsoSvg>
  );
}

/** Warehouse: a dock with a van backed up to it and pallets waiting to be checked. */
export function WarehouseScene({ className }: { className?: string }) {
  return (
    <IsoSvg viewBox="-230 -185 470 300" label="A warehouse dock with a van unloading and pallets of cartons" className={className}>
      <Ground cx={0} cy={60} rx={210} ry={62} />
      <IsoGroup prisms={[{ x: -80, y: -30, z: 0, w: 150, d: 120, h: 6, top: "#e6e1d9", left: "#d3ccc1", right: "#bdb5a8" }]} />
      <IsoGroup prisms={depot(-80, -110, 150, 70, 78)} />
      <DepotLogo x={-80} y={-110} w={150} d={70} h={78} />
      <IsoGroup prisms={[...pallet(-60, 10), box(-57, 13, 7, 14), box(-41, 13, 7, 14), box(-57, 29, 7, 14), box(-41, 29, 7, 14), box(-49, 20, 19, 14)]} />
      <IsoGroup prisms={[...pallet(-10, 40), box(-7, 43, 7, 14), box(9, 43, 7, 14), box(1, 50, 19, 14)]} />
      <IsoGroup prisms={[...van(70, 10).map((p) => ({ ...p })), box(40, 70, 6, 13)]} />
      <VanWheels x={70} y={10} />
      <VanLogo x={70} y={10} />
      <ClipboardCheck x={-120} y={-20} />
      <Tree x={150} y={-60} r={12} />
    </IsoSvg>
  );
}

/** Customs: a declaration on a desk, the stamp just lifted, a barrier at the border. */
export function CustomsScene({ className }: { className?: string }) {
  const [sx, sy] = proj([30, 34, 26]);
  return (
    <IsoSvg viewBox="-215 -140 440 300" label="A customs desk with a stamped declaration and a border barrier" className={className}>
      <Ground cx={10} cy={60} rx={200} ry={58} />
      <PrismShape p={road(-120, 90, 280, 40)} />
      <IsoGroup prisms={[
        { x: -20, y: 0, z: 0, w: 90, d: 60, h: 22, top: "#ffffff", left: "#f1eee9", right: "#ddd7cf" },
        { x: 0, y: 12, z: 22, w: 46, d: 36, h: 1.5, top: "#fffdf8", left: "#f1eee9", right: "#ddd7cf",
          decals: [
            { face: "top", u0: 6, u1: 34, v0: 6, v1: 8, fill: "#cdc6bb", stroke: false },
            { face: "top", u0: 6, u1: 28, v0: 12, v1: 14, fill: "#cdc6bb", stroke: false },
            { face: "top", u0: 6, u1: 30, v0: 18, v1: 20, fill: "#cdc6bb", stroke: false },
          ] },
      ]} />
      {/* the stamp mark on the declaration */}
      <ellipse cx={sx} cy={sy + 3} rx={11} ry={6.5} fill="none" stroke="#ff5a1f" strokeWidth={2.4} transform={`rotate(-8 ${sx} ${sy + 3})`} />
      {/* the stamp itself, lifted */}
      <g className="iso-bob">
        <IsoGroup prisms={[
          { x: 52, y: 6, z: 40, w: 16, d: 16, h: 6, top: "#ff8a52", left: "#ff5a1f", right: "#d9460f" },
          { x: 57, y: 11, z: 46, w: 6, d: 6, h: 12, top: "#3a3632", left: "#262320", right: "#151412" },
        ]} />
      </g>
      <IsoGroup prisms={[box(-80, 20, 0, 18), box(-80, 40, 0, 18), box(-78, 30, 15, 18)]} />
      <Barrier x={70} y={84} />
      <Tree x={-120} y={-40} r={11} />
    </IsoSvg>
  );
}

/** Carrier: a van on the road between pickup boxes and a signpost. */
export function CarrierScene({ className }: { className?: string }) {
  return (
    <IsoSvg viewBox="-230 -140 470 290" label="A van on the road collecting cartons" className={className}>
      <Ground cx={0} cy={60} rx={210} ry={58} />
      <PrismShape p={road(-140, 30, 320, 46)} />
      <IsoGroup prisms={[...pallet(-120, -40), box(-117, -37, 7, 14), box(-101, -37, 7, 14), box(-109, -30, 19, 14)]} />
      <DrivingVan x={30} y={40} />
      <Signpost x={150} y={-20} />
      <Tree x={-40} y={-70} r={12} />
      <Tree x={60} y={110} r={11} />
    </IsoSvg>
  );
}

/** A striped border barrier whose arm swings across the road (the road runs along x, so the arm runs along y). */
function Barrier({ x, y }: { x: number; y: number }) {
  const [px, py] = proj([x + 4, y + 4, 26]);
  const [ex, ey] = proj([x + 4, y + 58, 26]);
  return (
    <g>
      <PrismShape p={{ x, y, z: 0, w: 8, d: 8, h: 30, top: "#3a3632", left: "#262320", right: "#151412" }} />
      <line x1={px} y1={py} x2={ex} y2={ey} stroke={INK} strokeWidth={7} strokeLinecap="round" />
      <line x1={px} y1={py} x2={ex} y2={ey} stroke="#ffffff" strokeWidth={4.5} strokeLinecap="round" />
      <line x1={px} y1={py} x2={ex} y2={ey} stroke="#ff5a1f" strokeWidth={4.5} strokeDasharray="8 8" />
    </g>
  );
}

function Signpost({ x, y }: { x: number; y: number }) {
  const [bx, by] = proj([x, y, 0]);
  return (
    <g>
      <line x1={bx} y1={by} x2={bx} y2={by - 62} stroke={INK} strokeWidth={2.2} />
      {[["DE", 0], ["FR", 15], ["NL", 30]].map(([t, dy]) => (
        <g key={t as string} transform={`translate(${bx} ${by - 60 + (dy as number)}) skewY(-12)`}>
          <rect x={0} y={0} width={34} height={12} rx={2} fill="#ffffff" stroke={INK} strokeWidth={1.3} />
          <text x={8} y={9.5} fontSize={8.5} fontWeight={700} fill={INK} fontFamily="var(--font-archivo), sans-serif">{t}</text>
        </g>
      ))}
    </g>
  );
}

function ClipboardCheck({ x, y }: { x: number; y: number }) {
  const [cx, cy] = proj([x, y, 0]);
  return (
    <g transform={`translate(${cx} ${cy - 46})`}>
      <rect x={0} y={0} width={30} height={40} rx={4} fill="#ffffff" stroke={INK} strokeWidth={1.4} />
      <rect x={9} y={-4} width={12} height={8} rx={2} fill={kraft.left} stroke={INK} strokeWidth={1.2} />
      <path d="M8 18 l4 4 l9 -10" fill="none" stroke="#ff5a1f" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
      <line x1={8} y1={30} x2={22} y2={30} stroke="#cdc6bb" strokeWidth={2} />
    </g>
  );
}
