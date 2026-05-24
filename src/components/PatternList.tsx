import { useEffect, useRef, useState } from 'react'
import { LIBRARIES } from '@/pixelblaze/libs'
import { uniquePatternName, nameConflicts } from '@/engine/patternName'
import { useEditorStore } from '@/store/editorStore'
import { usePatternStore, PatternRecord } from '@/store/patternStore'

const LIBRARY_NAMES = Object.keys(LIBRARIES).sort()

const NEW_PATTERN_SRC = `export function beforeRender(delta) {
}

export function render2D(index, x, y) {
  hsv(x, 1, 1)
}
`

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

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
}: {
  label: string
  active: boolean
  dim?: string
  onClick: () => void
}) {
  return (
    <li
      onClick={onClick}
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
  const activePatternId = usePatternStore((s) => s.activePatternId)
  const userPatterns = usePatternStore((s) => s.userPatterns)
  const setActiveLibrary = usePatternStore((s) => s.setActiveLibrary)
  const setActivePattern = usePatternStore((s) => s.setActivePattern)
  const loadPatterns = usePatternStore((s) => s.loadPatterns)
  const addPattern = usePatternStore((s) => s.addPattern)
  const renamePattern = usePatternStore((s) => s.renamePattern)
  const removePattern = usePatternStore((s) => s.removePattern)

  useEffect(() => {
    loadPatterns()
  }, [loadPatterns])

  function openLibrary(name: string) {
    setActiveLibrary(name)
    setSource(LIBRARIES[name])
    setIsReadOnly(true)
  }

  function openUserPattern(pattern: PatternRecord) {
    setActivePattern(pattern.id)
    setSource(pattern.src)
    setPreviewSource(pattern.src)
    setPreviewPatternName(pattern.name)
    setIsReadOnly(false)
  }

  async function handleCreate() {
    const id = generateId()
    const existingNames = userPatterns.map((p) => p.name)
    const name = uniquePatternName('Untitled Pattern', existingNames)
    const record: PatternRecord = {
      id,
      name,
      src: NEW_PATTERN_SRC,
      controls: {},
      updatedAt: Date.now(),
    }
    await addPattern(record)
    setActivePattern(id)
    setSource(record.src)
    setIsReadOnly(false)
  }

  return (
    <div className="flex flex-col h-full text-sm">
      <div className="flex items-center justify-between pr-2">
        <SectionHeader label="Your Patterns" />
        <button
          onClick={handleCreate}
          className="text-zinc-500 hover:text-zinc-200 text-lg leading-none px-1"
          title="New pattern"
        >
          +
        </button>
      </div>

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

      <SectionHeader label="Libraries" />
      <ul>
        {LIBRARY_NAMES.map((name) => (
          <ListItem
            key={name}
            label={name}
            active={activeLibraryName === name}
            dim="read-only"
            onClick={() => openLibrary(name)}
          />
        ))}
      </ul>
    </div>
  )
}
