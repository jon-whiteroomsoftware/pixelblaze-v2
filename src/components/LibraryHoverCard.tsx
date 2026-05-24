import { createPortal } from 'react-dom'
import { CHEATSHEETS, type CheatsheetSection, type FunctionEntry } from '@/pixelblaze/cheatsheets'

interface Props {
  name: string
  anchorRect: DOMRect
  onMouseEnter: () => void
  onMouseLeave: () => void
}

const SIDEBAR_W = 224  // w-56
const PREVIEW_W = 320  // w-80
const MAX_HEIGHT = 520

function Entry({ entry }: { entry: FunctionEntry }) {
  if (entry.desc) {
    return (
      <div className="mb-1.5">
        <div className="font-mono text-xs font-semibold text-zinc-100 leading-tight">{entry.sig}</div>
        <div className="font-mono text-xs text-zinc-500 pl-2 leading-tight">{entry.desc}</div>
      </div>
    )
  }
  return (
    <div className="font-mono text-xs text-zinc-300 leading-tight mb-1">
      {entry.sig}
    </div>
  )
}

function Section({ section }: { section: CheatsheetSection }) {
  return (
    <div className="break-inside-avoid mb-4">
      <div className="text-xs font-semibold tracking-widest uppercase text-zinc-500 mb-1.5">
        {section.header}
      </div>
      {section.entries.map((entry, i) => (
        <Entry key={i} entry={entry} />
      ))}
    </div>
  )
}

export function LibraryHoverCard({ name, anchorRect, onMouseEnter, onMouseLeave }: Props) {
  const data = CHEATSHEETS[name]
  if (!data) return null

  const top = Math.max(8, Math.min(anchorRect.top, window.innerHeight - MAX_HEIGHT - 8))
  const midpoint = Math.ceil(data.sections.length / 2)
  const col1 = data.sections.slice(0, midpoint)
  const col2 = data.sections.slice(midpoint)

  return createPortal(
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        position: 'fixed',
        left: SIDEBAR_W + 1,
        top,
        width: `calc(100vw - ${SIDEBAR_W + 1}px - ${PREVIEW_W}px)`,
        maxHeight: MAX_HEIGHT,
        zIndex: 50,
      }}
      className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl overflow-y-auto p-4"
    >
      <div className="flex gap-6">
        <div className="flex-1 min-w-0">
          {col1.map((s) => <Section key={s.header} section={s} />)}
        </div>
        {col2.length > 0 && (
          <div className="flex-1 min-w-0">
            {col2.map((s) => <Section key={s.header} section={s} />)}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
