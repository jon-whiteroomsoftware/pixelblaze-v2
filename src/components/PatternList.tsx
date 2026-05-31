import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { LIBRARIES } from '@/pixelblaze/libs'
import { DEMOS } from '@/pixelblaze/demos'
import { nameConflicts, uniquePatternName } from '@/engine/patternName'
import { NEW_PATTERN_SRC } from '@/pixelblaze/newPattern'
import { getSetting } from '@/engine/storage'
import { useEditorStore } from '@/store/editorStore'
import { usePatternStore, PatternRecord, LastActive, LAST_ACTIVE_KEY } from '@/store/patternStore'
import { useMapStore } from '@/store/mapStore'
import { LibraryHoverCard } from '@/components/LibraryHoverCard'
import {
  AlertDialogRoot,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'

const LIBRARY_NAMES = Object.keys(LIBRARIES).sort()
const DEMO_NAMES = Object.keys(DEMOS).sort()

const OPENGL_DEMOS = ['Kishimisu', 'NeonSquircles', 'ShaderShowcase', 'ZippyZaps', 'IQPalettes', 'PhantomStar']
const BRAND_NEW_DEMOS = ['PlasmaNebula', 'Caustics', 'KaleidoBloom']
// Minimal patterns — one per render dimensionality — for visually verifying
// 1D / 2D / 3D preview behavior. The trailing dim tag mirrors each render fn.
const TEST_PATTERNS = ['TestPattern1D', 'TestPattern2D', 'TestPattern3D']
const TEST_PATTERN_DIMS: Record<string, string> = {
  TestPattern1D: '1D',
  TestPattern2D: '2D',
  TestPattern3D: '3D',
}
const GROUPED_DEMOS = new Set([...OPENGL_DEMOS, ...BRAND_NEW_DEMOS, ...TEST_PATTERNS])

// "Old Favorites" is the rest — anything not explicitly grouped, so new demos
// land there by default until reassigned.
const DEMO_SECTIONS: { label: string; names: string[] }[] = [
  { label: 'OpenGL', names: OPENGL_DEMOS.filter((n) => DEMO_NAMES.includes(n)) },
  { label: 'Old Favorites', names: DEMO_NAMES.filter((n) => !GROUPED_DEMOS.has(n)) },
  { label: 'Brand New', names: BRAND_NEW_DEMOS.filter((n) => DEMO_NAMES.includes(n)) },
  { label: 'Test Patterns', names: TEST_PATTERNS.filter((n) => DEMO_NAMES.includes(n)) },
]

// A turn-down chevron, sized to read as a clear interactive affordance. Points down
// when open, rotates to point right when collapsed. Inherits the header's text color
// so it brightens with the label on hover.
function CollapseChevron({ collapsed }: { collapsed: boolean }) {
  return (
    <ChevronDown
      size={15}
      className={`shrink-0 transition-transform ${collapsed ? '-rotate-90' : ''}`}
    />
  )
}

function SectionHeader({
  label,
  collapsed,
  onToggle,
}: {
  label: string
  collapsed: boolean
  onToggle: () => void
}) {
  return (
    <div
      onClick={onToggle}
      className="mt-1 px-3 py-1.5 flex items-center justify-between gap-1 cursor-pointer select-none text-[11px] font-mono font-semibold text-amber-500/60 uppercase tracking-wider border-t border-zinc-800 bg-zinc-950/60 hover:text-amber-500/90"
    >
      <span className="truncate">{label}</span>
      <CollapseChevron collapsed={collapsed} />
    </div>
  )
}

function SubsectionHeader({
  label,
  collapsed,
  onToggle,
}: {
  label: string
  collapsed: boolean
  onToggle: () => void
}) {
  return (
    <div
      onClick={onToggle}
      className="pl-6 pr-3 py-1 flex items-center justify-between gap-1 cursor-pointer select-none text-[11px] font-mono text-amber-500/60 uppercase tracking-wider hover:text-amber-500/90"
    >
      <span className="truncate">{label}</span>
      <CollapseChevron collapsed={collapsed} />
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
        'pl-6 pr-3 py-1 cursor-pointer truncate select-none flex items-center gap-1.5',
        'hover:text-zinc-300 hover:bg-zinc-800/60',
        active ? 'bg-zinc-800/60 text-amber-400' : 'text-zinc-400',
      ].join(' ')}
    >
      {label}
      {dim && <span className="text-zinc-400 text-xs shrink-0">{dim}</span>}
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
  const [hovered, setHovered] = useState(false)
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

  return (
    <AlertDialogRoot>
      <li
        onClick={onSelect}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={[
          'pl-6 pr-3 py-1 cursor-pointer select-none flex items-center gap-1',
          'hover:text-zinc-300 hover:bg-zinc-800/60',
          active ? 'bg-zinc-800/60 text-amber-400' : 'text-zinc-400',
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
        ) : hovered ? (
          <>
            <span className="flex-1 min-w-0 truncate">{pattern.name}</span>
            <button
              onClick={startEdit}
              className="text-zinc-500 hover:text-zinc-300 text-xs px-1 shrink-0"
              title="Rename"
            >
              ✎
            </button>
            <AlertDialogTrigger asChild>
              <button
                onClick={(e) => e.stopPropagation()}
                className="text-zinc-500 hover:text-red-400 text-xs px-1 shrink-0"
                title="Delete"
              >
                ✕
              </button>
            </AlertDialogTrigger>
          </>
        ) : (
          <span>{pattern.name}</span>
        )}
      </li>
      <AlertDialogContent>
        <AlertDialogTitle>Delete pattern?</AlertDialogTitle>
        <AlertDialogDescription>
          "{pattern.name}" will be permanently deleted and cannot be recovered.
        </AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialogRoot>
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

  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})
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
    // Hydrate user maps (and seed the stock custom maps, #140) so the layout
    // selector is populated before the first pattern opens.
    useMapStore.getState().loadMaps()
  }, [])

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
        } else {
          const { addPattern } = usePatternStore.getState()
          const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
          const name = uniquePatternName('Untitled Pattern', [])
          const record = { id, name, src: NEW_PATTERN_SRC, controls: {}, updatedAt: Date.now() }
          await addPattern(record)
          setActivePattern(id)
          setSource(record.src)
          setPreviewSource(record.src)
          setPreviewPatternName(record.name)
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

  const isCollapsed = (label: string) => !!collapsedSections[label]
  const toggleCollapsed = (label: string) =>
    setCollapsedSections((c) => ({ ...c, [label]: !c[label] }))

  return (
    <div className="flex flex-col h-full text-xs font-mono">
      <SectionHeader
        label="Your Patterns"
        collapsed={isCollapsed('Your Patterns')}
        onToggle={() => toggleCollapsed('Your Patterns')}
      />
      {!isCollapsed('Your Patterns') && (
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
      )}

      <SectionHeader
        label="Libraries"
        collapsed={isCollapsed('Libraries')}
        onToggle={() => toggleCollapsed('Libraries')}
      />
      {!isCollapsed('Libraries') && (
        <ul>
          <li
            onMouseEnter={(e) => startShow('PixelBlaze', e.currentTarget)}
            onMouseLeave={startHide}
            className="pl-6 pr-3 py-1 select-none flex items-center gap-1.5 cursor-default hover:text-zinc-300 hover:bg-zinc-800/60 text-zinc-400"
          >
            PixelBlaze
          </li>
          {LIBRARY_NAMES.map((name) => (
            <ListItem
              key={name}
              label={name}
              active={activeLibraryName === name}
              onClick={() => openLibrary(name)}
              onMouseEnter={(e) => startShow(name, e.currentTarget)}
              onMouseLeave={startHide}
            />
          ))}
        </ul>
      )}

      <SectionHeader
        label="Demos"
        collapsed={isCollapsed('Demos')}
        onToggle={() => toggleCollapsed('Demos')}
      />
      {!isCollapsed('Demos') &&
        DEMO_SECTIONS.map((section) => {
          const collapsed = isCollapsed(section.label)
          return (
            <div key={section.label}>
              <SubsectionHeader
                label={section.label}
                collapsed={collapsed}
                onToggle={() => toggleCollapsed(section.label)}
              />
              {!collapsed && (
                <ul>
                  {section.names.map((name) => (
                    <ListItem
                      key={name}
                      label={name}
                      dim={TEST_PATTERN_DIMS[name]}
                      active={activeDemoName === name}
                      onClick={() => openDemo(name)}
                    />
                  ))}
                </ul>
              )}
            </div>
          )
        })}

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
