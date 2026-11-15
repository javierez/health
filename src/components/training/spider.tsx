/**
 * A session's spider (Javier, 15-nov-2026: «a spider map of the training»):
 * one arm per muscle group, as long as the sets it got, rings at a quarter,
 * half and three quarters of the most worked one.
 */
export function Spider({ arms }: { arms: { label: string; sets: number }[] }) {
  const R = 90;
  const C = 150;
  const top = Math.max(4, ...arms.map((a) => a.sets));
  const at = (i: number, r: number) => {
    const a = (i / arms.length) * 2 * Math.PI - Math.PI / 2;
    return [C + Math.cos(a) * r, C + Math.sin(a) * r] as const;
  };
  const ring = (f: number) => arms.map((_, i) => at(i, R * f).join(",")).join(" ");
  const shape = arms.map((a, i) => at(i, R * (a.sets / top)).join(",")).join(" ");
  return (
    <svg viewBox="-60 10 420 280" className="mx-auto w-full max-w-[26rem]" role="img" aria-label={arms.map((a) => `${a.label} ${a.sets}`).join(", ")}>
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon key={f} points={ring(f)} fill="none" className="stroke-gray-200" strokeWidth="1" />
      ))}
      {arms.map((_, i) => {
        const [x, y] = at(i, R);
        return <line key={i} x1={C} y1={C} x2={x} y2={y} className="stroke-gray-100" strokeWidth="1" />;
      })}
      <polygon points={shape} className="fill-amber-500/25 stroke-amber-500" strokeWidth="2" strokeLinejoin="round" />
      {arms.map((a, i) => {
        const [x, y] = at(i, R + 22);
        const anchor = Math.abs(x - C) < 4 ? "middle" : x > C ? "start" : "end";
        return (
          <text key={a.label} x={x} y={y} textAnchor={anchor} dominantBaseline="middle" className={a.sets > 0 ? "fill-gray-900" : "fill-gray-300"} fontSize="11">
            {a.label}
            <tspan className={a.sets > 0 ? "fill-gray-500" : "fill-gray-300"}> {a.sets.toLocaleString("es-ES")}</tspan>
          </text>
        );
      })}
    </svg>
  );
}
