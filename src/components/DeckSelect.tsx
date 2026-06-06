import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'

export interface DeckOption<T> {
  value: T
  label: string
  title?: string
  // Optional small muted suffix shown after the label (e.g. a "2D" dimension
  // tag). Decorative — marked aria-hidden so it never enters the accessible name.
  badge?: string
  // Optional subgroup label. When options carry more than one distinct group, the
  // menu renders a non-clickable header above each group's first option (options are
  // assumed pre-sorted so a group's members are contiguous). A single group renders
  // no header.
  group?: string
}

// A lightweight bordered dropdown for the preview deck (#150): a thin-bordered
// trigger showing the current value with a down chevron — clearly an interactive
// control that opens a menu — over a simple listbox of options. Shared by the
// renderer and speed controls so they read identically; all option/selection logic
// is the caller's, this is a pure presentation shell.
export function DeckSelect<T extends string | number>({
  ariaLabel,
  value,
  options,
  onChange,
  menuWidthClass = 'w-24',
}: {
  ariaLabel: string
  value: T
  options: DeckOption<T>[]
  onChange: (value: T) => void
  menuWidthClass?: string
}) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const current = options.find((o) => o.value === value) ?? options[0]
  // Only show subgroup headers when the options actually span more than one group;
  // a lone group (the common no-user-maps case) reads cleaner with no header.
  const showGroups = new Set(options.map((o) => o.group).filter(Boolean)).size > 1

  useEffect(() => {
    if (!isOpen) return
    const handleMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [isOpen])

  return (
    <div ref={containerRef} className="relative">
      <button
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((o) => !o)}
        className="flex items-center gap-0.5 h-5 pl-1 pr-0.5 shrink-0 rounded border border-zinc-500 text-[11px] tabular-nums text-zinc-300 hover:border-zinc-400 hover:text-amber-400/80 transition-colors"
      >
        <span className="whitespace-nowrap">{current?.label}</span>
        {current?.badge && (
          <span aria-hidden className="ml-1 text-zinc-500">
            {current.badge}
          </span>
        )}
        <ChevronDown size={12} className="shrink-0 text-zinc-500" />
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-label={ariaLabel}
          className={`absolute top-full right-0 mt-1 ${menuWidthClass} bg-zinc-900 border border-zinc-800 rounded-md shadow-xl z-50 py-1`}
        >
          {options.map((opt, i) => {
            const header =
              showGroups && opt.group && opt.group !== options[i - 1]?.group ? (
                <div
                  key={`group-${opt.group}`}
                  role="presentation"
                  // Match the pattern-rail section headers: `text-structural` grey, and
                  // extra top space before a later group so the subgroups read as
                  // visually separated (the first group sits flush to the menu top).
                  className={`px-3 ${i === 0 ? 'pt-0.5' : 'pt-3'} pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-structural select-none`}
                >
                  {opt.group}
                </div>
              ) : null
            return (
              <div key={String(opt.value)}>
                {header}
                <button
                  role="option"
                  aria-selected={opt.value === current?.value}
                  title={opt.title}
                  onClick={() => {
                    onChange(opt.value)
                    setIsOpen(false)
                  }}
                  className={`block w-full whitespace-nowrap text-left px-3 py-0.5 text-xs tabular-nums transition-colors hover:bg-zinc-800 ${
                    opt.value === current?.value ? 'text-amber-400' : 'text-zinc-300'
                  }`}
                >
                  {opt.label}
                  {opt.badge && (
                    <span aria-hidden className="ml-1 text-zinc-500">
                      {opt.badge}
                    </span>
                  )}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
