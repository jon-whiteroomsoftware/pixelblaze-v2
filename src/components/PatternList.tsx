import { useEffect, useRef, useState } from 'react'
import { LIBRARIES } from '@/pixelblaze/libs'
import { DEMOS } from '@/pixelblaze/demos'
import { nameConflicts } from '@/engine/patternName'
import { getSetting } from '@/engine/storage'
import { useEditorStore } from '@/store/editorStore'
import { usePatternStore, PatternRecord, LastActive, LAST_ACTIVE_KEY } from '@/store/patternStore'
import { LibraryHoverCard } from '@/components/LibraryHoverCard'

const LIBRARY_NAMES = Object.keys(LIBRARIES).sort()
const DEMO_NAMES = Object.keys(DEMOS).sort()

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="px-3 py-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
      {label}
    </div>
  )
}

function ListItem({
  label,
  active,
  dim,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: {
  label: string
  active: boolean
  dim?: string
  onClick: () => void
  onMouseEnter?: (e: React.MouseEvent<HTMLLIElement>) => void
  onMouseLeave?: () => void
}) {
  return (
    <li
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={[
        'px-3 py-1.5 cursor-pointer truncate select-none flex items-center gap-1.5',
        'hover:text-zinc-100 hover:bg-zinc-800',
        active ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400',
      ].join(' ')}
    >
      {label}
      {dim && <span className="text-zinc-600 text-xs shrink-0">{dim}</span>}
    </li>
  )
}

function UserPatternItem({
  pattern,
  active,
  takenNames,
  onSelect,
  onRename,
  onDelete,
}: {
  pattern: PatternRecord
  active: boolean
  takenNames: string[]
  onSelect: () => void
  onRename: (name: string) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(pattern.name)
  const [conflict, setConflict] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation()
    setDraft(pattern.name)
    setConflict(false)
    setEditing(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  function commitRename() {
    const trimmed = draft.trim()
    if (!trimmed) { setEditing(false); return }
    if (trimmed === pattern.name) { setEditing(false); return }
    if (nameConflicts(trimmed, takenNames)) {
      setConflict(true)
      inputRef.current?.select()
      return
    }
    onRename(trimmed)
    setEditing(false)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') commitRename()
    if (e.key === 'Escape') setEditing(false)
  }

  function handleDraftChange(e: React.ChangeEvent<HTMLInputElement>) {
    setDraft(e.target.value)
    if (conflict) setConflict(false)
  }

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    if (confirm(`Delete "${pattern.name}"?`)) onDelete()
  }

  return (
    <li
      onClick={onSelect}
      className={[
        'px-3 py-1.5 cursor-pointer select-none flex items-center gap-1',
        'hover:text-zinc-100 hover:bg-zinc-800 group',
        active ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400',
      ].join(' ')}
    >
      {editing ? (
        <input
          ref={inputRef}
          autoFocus
          value={draft}
          onChange={handleDraftChange}
          onBlur={commitRename}
          onKeyDown={onKeyDown}
          onClick={(e) => e.stopPropagation()}
          className={[
            'flex-1 min-w-0 text-sm px-1 rounded outline-none',
            conflict
              ? 'bg-red-900/60 text-red-200 ring-1 ring-red-500'
              : 'bg-zinc-700 text-zinc-100',
          ].join(' ')}
          title={conflict ? 'A pattern with that name already exists' : undefined}
        />
      ) : (
        <>
          <span className="flex-1 min-w-0 truncate">{pattern.name}</span>
          <button
            onClick={startEdit}
            className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-zinc-300 text-xs px-1 shrink-0"
            title="Rename"
          >
            ✎
          </button>
          <button
            onClick={handleDelete}
            className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 text-xs px-1 shrink-0"
            title="Delete"
          >
            ✕
          </button>
        </>
      )}
    </li>
  )
}

export function PatternList() {
  const setSource = useEditorStore((s) => s.setSource)
  const setIsReadOnly = useEditorStore((s) => s.setIsReadOnly)
  const setPreviewSource = useEditorStore((s) => s.setPreviewSource)
  const setPreviewPatternName = useEditorStore((s) => s.setPreviewPatternName)
  const activeLibraryName = usePatternStore((s) => s.activeLibraryName)
  const activeDemoName = usePatternStore((s) => s.activeDemoName)
  const activePatternId = usePatternStore((s) => s.activePatternId)
  const userPatterns = usePatternStore((s) => s.userPatterns)
  const setActiveLibrary = usePatternStore((s) => s.setActiveLibrary)
  const setActiveDemo = usePatternStore((s) => s.setActiveDemo)
  const setActivePattern = usePatternStore((s) => s.setActivePattern)
  const loadPatterns = usePatternStore((s) => s.loadPatterns)
  const renamePattern = usePatternStore((s) => s.renamePattern)
  const removePattern = usePatternStore((s) => s.removePattern)

  const [hoveredLib, setHoveredLib] = useState<string | null>(null)
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)
  const hoveredLibRef = useRef<string | null>(null)
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (showTimerRef.current) clearTimeout(showTimerRef.current)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
  }, [])

  function startShow(name: string, el: HTMLElement) {
    if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null }
    if (hoveredLibRef.current !== null) {
      setAnchorRect(el.getBoundingClientRect())
      setHoveredLib(name)
      hoveredLibRef.current = name
      return
    }
    showTimerRef.current = setTimeout(() => {
      setAnchorRect(el.getBoundingClientRect())
      setHoveredLib(name)
      hoveredLibRef.current = name
    }, 250)
  }

  function startHide() {
    if (showTimerRef.current) { clearTimeout(showTimerRef.current); showTimerRef.current = null }
    hideTimerRef.current = setTimeout(() => {
      setHoveredLib(null)
      hoveredLibRef.current = null
    }, 100)
  }

  function cancelHide() {
    if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null }
  }

  useEffect(() => {
    loadPatterns().then(async () => {
      const last = await getSetting<LastActive>(LAST_ACTIVE_KEY).catch(() => undefined)
      const { userPatterns, setActivePattern, setActiveLibrary, setActiveDemo } = usePatternStore.getState()
      const { setSource, setIsReadOnly, setPreviewSource, setPreviewPatternName } = useEditorStore.getState()
      if (!last) {
        const p = userPatterns[0]
        if (p) {
          setActivePattern(p.id)
          setSource(p.src)
          setPreviewSource(p.src)
          setPreviewPatternName(p.name)
          setIsReadOnly(false)
        }
        return
      }
      if (last.type === 'pattern') {
        const p = userPatterns.find((p) => p.id === last.id)
        if (p) {
          setActivePattern(p.id)
          setSource(p.src)
          setPreviewSource(p.src)
          setPreviewPatternName(p.name)
          setIsReadOnly(false)
        }
      } else if (last.type === 'demo') {
        if (DEMOS[last.name]) {
          setActiveDemo(last.name)
          setSource(DEMOS[last.name])
          setPreviewSource(DEMOS[last.name])
          setPreviewPatternName(last.name)
          setIsReadOnly(true)
        }
      } else if (last.type === 'library') {
        if (LIBRARIES[last.name]) {
          setActiveLibrary(last.name)
          setSource(LIBRARIES[last.name])
          setIsReadOnly(true)
        }
      }
    })
  }, [loadPatterns])

  function openLibrary(name: string) {
    setActiveLibrary(name)
    setSource(LIBRARIES[name])
    setIsReadOnly(true)
  }

  function openDemo(name: string) {
    setActiveDemo(name)
    setSource(DEMOS[name])
    setPreviewSource(DEMOS[name])
    setPreviewPatternName(name)
    setIsReadOnly(true)
  }

  function openUserPattern(pattern: PatternRecord) {
    setActivePattern(pattern.id)
    setSource(pattern.src)
    setPreviewSource(pattern.src)
    setPreviewPatternName(pattern.name)
    setIsReadOnly(false)
  }

  return (
    <div className="flex flex-col h-full text-sm">
      <SectionHeader label="Your Patterns" />

      <ul>
        {userPatterns.map((pattern) => (
          <UserPatternItem
            key={pattern.id}
            pattern={pattern}
            active={activePatternId === pattern.id}
            takenNames={userPatterns.filter((p) => p.id !== pattern.id).map((p) => p.name)}
            onSelect={() => openUserPattern(pattern)}
            onRename={(name) => renamePattern(pattern.id, name)}
            onDelete={() => removePattern(pattern.id)}
          />
        ))}
      </ul>

      <SectionHeader label="Demos" />
      <ul>
        {DEMO_NAMES.map((name) => (
          <ListItem
            key={name}
            label={name}
            active={activeDemoName === name}
            dim="read-only"
            onClick={() => openDemo(name)}
          />
        ))}
      </ul>

      <SectionHeader label="Libraries" />
      <ul>
        <li
          onMouseEnter={(e) => startShow('PixelBlaze', e.currentTarget)}
          onMouseLeave={startHide}
          className="px-3 py-1.5 select-none flex items-center gap-1.5 cursor-default hover:text-zinc-100 hover:bg-zinc-800 text-zinc-400"
        >
          PixelBlaze
        </li>
        {LIBRARY_NAMES.map((name) => (
          <ListItem
            key={name}
            label={name}
            active={activeLibraryName === name}
            dim="read-only"
            onClick={() => openLibrary(name)}
            onMouseEnter={(e) => startShow(name, e.currentTarget)}
            onMouseLeave={startHide}
          />
        ))}
      </ul>

      {hoveredLib && anchorRect && (
        <LibraryHoverCard
          name={hoveredLib}
          anchorRect={anchorRect}
          onMouseEnter={cancelHide}
          onMouseLeave={startHide}
        />
      )}
    </div>
  )
}
