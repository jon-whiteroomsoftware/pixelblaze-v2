import { Fragment } from 'react'
import { createPortal } from 'react-dom'
import { CHEATSHEETS, type CheatsheetSection, type FunctionEntry } from '@/pixelblaze/cheatsheets'

interface Props {
  name: string
  anchorRect: DOMRect
  onMouseEnter: () => void
  onMouseLeave: () => void
}

const MAX_HEIGHT = 520

const BUILTIN_COLOR = '#4FC1FF'  // support.function in editor theme
const LIB_IDENT_COLOR = '#9CDCFE'  // identifier in editor theme

function renderPart(part: string, identColor: string) {
  const parenIdx = part.indexOf('(')
  if (parenIdx !== -1) {
    return (
      <>
        <span style={{ color: identColor, fontWeight: 'bold' }}>{part.slice(0, parenIdx)}</span>
        <span className="text-zinc-400">{part.slice(parenIdx)}</span>
      </>
    )
  }
  return <span style={{ color: identColor, fontWeight: 'bold' }}>{part}</span>
}

function renderSig(sig: string, identColor: string, plain?: boolean) {
  const dotParts = sig.split(' · ')
  if (dotParts.length > 1) {
    return dotParts.map((part, i) => (
      <Fragment key={i}>
        {i > 0 && <span className="text-zinc-500"> · </span>}
        {renderPart(part.trim(), identColor)}
      </Fragment>
    ))
  }
  if (plain && !sig.includes('(')) {
    const tokens = sig.trim().split(/\s+/)
    return tokens.map((token, i) => (
      <Fragment key={i}>
        {i > 0 && '  '}
        <span style={{ color: identColor, fontWeight: 'bold' }}>{token}</span>
      </Fragment>
    ))
  }
  return renderPart(sig, identColor)
}

function Entry({ entry, identColor }: { entry: FunctionEntry; identColor: string }) {
  if (entry.desc) {
    return (
      <div className="mb-1.5">
        <div className="font-mono text-xs leading-tight">{renderSig(entry.sig, identColor, entry.plain)}</div>
        <div className="font-mono text-xs text-zinc-500 pl-2 leading-tight">{entry.desc}</div>
      </div>
    )
  }
  return (
    <div className="font-mono text-xs text-zinc-300 leading-tight mb-1">
      {renderSig(entry.sig, identColor, entry.plain)}
    </div>
  )
}

function Section({ section, identColor }: { section: CheatsheetSection; identColor: string }) {
  return (
    <div className="break-inside-avoid mb-4">
      <div className="text-xs font-semibold tracking-widest uppercase text-zinc-500 mb-1.5">
        {section.header}
      </div>
      {section.entries.map((entry, i) => (
        <Entry key={i} entry={entry} identColor={identColor} />
      ))}
    </div>
  )
}

export function LibraryHoverCard({ name, anchorRect, onMouseEnter, onMouseLeave }: Props) {
  const data = CHEATSHEETS[name]
  if (!data) return null

  const identColor = name === 'PixelBlaze' ? BUILTIN_COLOR : LIB_IDENT_COLOR
  const OVERLAP = 24
  const left = anchorRect.right - OVERLAP
  const cardWidth = Math.min(window.innerWidth - left - 8, window.innerWidth * 0.75)
  const top = Math.max(8, Math.min(anchorRect.bottom - MAX_HEIGHT, window.innerHeight - MAX_HEIGHT - 8))
  const midpoint = Math.ceil(data.sections.length / 2)
  const col1 = data.sections.slice(0, midpoint)
  const col2 = data.sections.slice(midpoint)

  return createPortal(
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        position: 'fixed',
        left,
        top,
        width: cardWidth,
        maxHeight: MAX_HEIGHT,
        zIndex: 50,
      }}
      className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl overflow-hidden p-4"
    >
      <div className="flex gap-6">
        <div className="flex-1 min-w-0">
          {col1.map((s) => <Section key={s.header} section={s} identColor={identColor} />)}
        </div>
        {col2.length > 0 && (
          <div className="flex-1 min-w-0">
            {col2.map((s) => <Section key={s.header} section={s} identColor={identColor} />)}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
