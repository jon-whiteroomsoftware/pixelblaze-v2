// The dimensionality cue shown next to a pattern title — one small pill per
// render dimension the pattern defines (e.g. "1D 3D"). Shared so the editor
// title, the preview header, and the controller panel title render it
// identically (#consistency). Pass the dims a pattern source exports via
// `exportedDims`.
export function DimPills({ dims }: { dims: (1 | 2 | 3)[] }) {
  return (
    <>
      {dims.map((d) => (
        <span
          key={d}
          className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-medium tracking-wide uppercase text-zinc-400 border border-zinc-700 leading-none"
        >
          {d}D
        </span>
      ))}
    </>
  )
}
