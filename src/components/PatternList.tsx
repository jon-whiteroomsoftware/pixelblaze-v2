import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Plus, FolderOpen, Search, X } from 'lucide-react'
import { LIBRARIES } from '@/pixelblaze/libs'
import { DEMOS } from '@/pixelblaze/demos'
import { nameConflicts, uniquePatternName } from '@/engine/patternName'
import { NEW_PATTERN_SRC } from '@/pixelblaze/newPattern'
import { parseEpe } from '@/engine/epeImport'
import { nativeDim, matchesLens, matchesQuery, type DimLens } from '@/engine/dimLens'
import { getSetting } from '@/engine/storage'
import { useEditorStore } from '@/store/editorStore'
import { usePatternStore, PatternRecord, LastActive, LAST_ACTIVE_KEY } from '@/store/patternStore'
import { useMapStore, MapRecord } from '@/store/mapStore'
import { forkSettingsSnapshotForDemo } from '@/store/settingsCascade'
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

// Module-scope factory for a fresh pattern record. Kept out of the component so its
// impure id/timestamp generation isn't attributed to render (react-hooks/purity).
function newPatternRecord(name: string, src: string): PatternRecord {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  return { id, name, src, controls: {}, updatedAt: Date.now() }
}

const DEMO_NAMES = Object.keys(DEMOS).sort()

const OPENGL_DEMOS = ['Kishimisu', 'NeonSquircles', 'ShaderShowcase', 'ZippyZaps', 'IQPalettes', 'PhantomStar']
const BRAND_NEW_DEMOS = ['PlasmaNebula', 'Caustics', 'KaleidoBloom', 'AuroraSphere']
// Pixelblaze-native sketches built around cheap fields, SDFs, and 3D math that
// should scale better than direct shader ports.
const NATIVE_SKETCHES = [
  'CorePulse3D',
  'CrystalLattice3D',
  'GyroidGlow3D',
  'MagneticFilaments',
  'MoireCathedral',
  'RibbonLoom',
  'Trainyard',
]
// 1D effects that lean on rhythm and emergence rather than the usual chases and
// crawls.
const LIVING_1D_DEMOS = ['PulseLoom', 'FireflyChoir']
// Minimal patterns — one per render dimensionality — for visually verifying
// 1D / 2D / 3D preview behavior.
const TEST_PATTERNS = ['TestPattern1D', 'TestPattern2D', 'TestPattern3D']
const GROUPED_DEMOS = new Set([
  ...OPENGL_DEMOS,
  ...BRAND_NEW_DEMOS,
  ...NATIVE_SKETCHES,
  ...LIVING_1D_DEMOS,
  ...TEST_PATTERNS,
])

// "Old Favorites" is the rest — anything not explicitly grouped, so new demos
// land there by default until reassigned.
const DEMO_SECTIONS: { label: string; names: string[] }[] = [
  { label: 'OpenGL', names: OPENGL_DEMOS.filter((n) => DEMO_NAMES.includes(n)) },
  { label: 'Old Favorites', names: DEMO_NAMES.filter((n) => !GROUPED_DEMOS.has(n)) },
  { label: 'Brand New', names: BRAND_NEW_DEMOS.filter((n) => DEMO_NAMES.includes(n)) },
  { label: 'Native Sketches', names: NATIVE_SKETCHES.filter((n) => DEMO_NAMES.includes(n)) },
  { label: 'Living 1D', names: LIVING_1D_DEMOS.filter((n) => DEMO_NAMES.includes(n)) },
  { label: 'Test Patterns', names: TEST_PATTERNS.filter((n) => DEMO_NAMES.includes(n)) },
]

// A turn-down chevron, sized to read as a clear interactive affordance. Points down
// when open, rotates to point right when collapsed. Inherits the header's text color
// so it brightens with the label on hover.
function CollapseChevron({ collapsed }: { collapsed: boolean }) {
  return (
    <ChevronDown
      size={17}
      className={`shrink-0 transition-transform ${collapsed ? '-rotate-90' : ''}`}
    />
  )
}

// An icon action button for a section header (e.g. "+" new, or open-from-disk).
// Stops propagation so clicking it acts without toggling the section's collapse.
// `title` doubles as the hover tooltip and the accessible label.
function HeaderAction({
  icon,
  title,
  onClick,
  disabled,
}: {
  icon: React.ReactNode
  title: string
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onClick?.()
      }}
      disabled={disabled}
      title={title}
      aria-label={title}
      className="shrink-0 text-zinc-400 hover:text-live disabled:opacity-30 disabled:hover:text-zinc-400"
    >
      {icon}
    </button>
  )
}

function SectionHeader({
  label,
  collapsed,
  onToggle,
  action,
  first,
}: {
  label: string
  collapsed: boolean
  onToggle: () => void
  action?: React.ReactNode
  // The topmost header has nothing above it to separate from, so it takes less top
  // pad; later sections lean on generous space above (not a colour/rule) to divide.
  first?: boolean
}) {
  return (
    <div
      onClick={onToggle}
      style={{ letterSpacing: '0.04em' }}
      className={`${first ? 'pt-1.5' : 'pt-3.5'} pb-1 px-3 flex items-center justify-between gap-1 cursor-pointer select-none text-[11px] font-mono font-semibold text-structural uppercase hover:text-live`}
    >
      <span className="truncate">{label}</span>
      <div className="flex items-center gap-1.5">
        {action}
        <CollapseChevron collapsed={collapsed} />
      </div>
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
      style={{ letterSpacing: '0.04em', paddingLeft: '26px' }}
      className="pt-2 pb-0.5 pr-3 flex items-center justify-between gap-1 cursor-pointer select-none text-[11px] font-mono font-semibold text-structural uppercase hover:text-live"
    >
      <span className="truncate">{label}</span>
      <CollapseChevron collapsed={collapsed} />
    </div>
  )
}

// First-level rows align flush with their section header (12px); rows beneath a
// Demos sub-category align flush with the sub-header (26px).
const ROW_PAD_FIRST = '12px'
const ROW_PAD_SUB = '26px'

// Shared row chrome (#182): tight ~19px rows, a 2px amber left accent bar + subtle
// warm bg when active, and absolutely-positioned hover affordances so the dim pill
// can yield to them without any row-width reflow.
const rowClass = (active: boolean) =>
  [
    'group relative flex items-center gap-1.5 pr-3 min-h-[19px] py-px cursor-pointer select-none',
    active ? 'text-live bg-live/5' : 'text-zinc-400 hover:text-zinc-300 hover:bg-zinc-800/60',
  ].join(' ')

function ActiveBar() {
  return <span aria-hidden className="absolute left-0 top-0 bottom-0 w-0.5 bg-live" />
}

// The dimensionality tag: a small bordered pill at the right end of the name. It
// fades out on row hover so hover-actions can occupy that space (it stays in flow,
// so the row never reflows).
function DimPill({ dim }: { dim: string }) {
  return (
    <span
      aria-hidden
      className="shrink-0 rounded border border-zinc-700 px-1 text-[8px] leading-[1.5] font-mono uppercase tracking-wide text-zinc-400 transition-opacity group-hover:opacity-0"
    >
      {dim}
    </span>
  )
}

// The dimension lens (#251): a segmented single-select `All | 1D | 2D | 3D`.
const DIM_LENS_OPTIONS: { label: string; value: DimLens }[] = [
  { label: 'All', value: 'all' },
  { label: '1D', value: 1 },
  { label: '2D', value: 2 },
  { label: '3D', value: 3 },
]

// The rail filter bar (#252): the dimension lens and the type-down name search share
// ONE row to conserve scarce vertical real estate. Collapsed, it shows the pills and a
// magnifier at the right. Hovering or clicking the magnifier scrolls the search input
// out (animated) and tucks the pills tighter so both fit. Both controls are ephemeral
// (component state, reset on reload). The search stays open while it holds text or has
// focus, so it won't snap shut mid-type when the cursor drifts off.
function RailFilterBar({
  lens,
  onLensChange,
  query,
  onQueryChange,
}: {
  lens: DimLens
  onLensChange: (lens: DimLens) => void
  query: string
  onQueryChange: (query: string) => void
}) {
  const [pinned, setPinned] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  // After a close-click the cursor is still on the icon, which would re-unfurl the box
  // via `hovered`. Latch hover off until the mouse genuinely leaves the area.
  const [hoverSuppressed, setHoverSuppressed] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  // "Committed open" = the user deliberately opened it (clicked or focused), as opposed
  // to a transient hover-preview. The icon acts as Close only when committed. Focus is
  // what holds it open, so blurring (a click elsewhere in the IDE) closes it — query is
  // deliberately NOT a keep-open input, or a closed-but-filtered list could linger.
  const committedOpen = pinned || focused
  const expanded = committedOpen || (hovered && !hoverSuppressed)

  // A click anywhere outside the search area blurs the input: fully close (unpin and
  // clear the query) so an out-of-IDE click dismisses the box and its filter together.
  function handleBlur() {
    setFocused(false)
    setPinned(false)
    onQueryChange('')
  }

  function toggle() {
    if (committedOpen) {
      // The icon is acting as Close: collapse, clear the query, drop focus, and suppress
      // the still-hovering icon from immediately re-opening the box.
      setPinned(false)
      onQueryChange('')
      inputRef.current?.blur()
      setHoverSuppressed(true)
    } else {
      // The icon is the magnifier (collapsed, or merely hover-previewing): clicking it
      // should open AND focus the input so you can type right away.
      setPinned(true)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }

  return (
    <div className="flex items-center gap-1 px-3 pt-1.5 pb-1">
      <div
        role="radiogroup"
        aria-label="Dimension filter"
        // Tighten the inter-pill gap too when expanded, ceding every spare pixel to
        // the search box.
        className={`flex shrink-0 transition-all ${expanded ? 'gap-px' : 'gap-0.5'}`}
      >
        {DIM_LENS_OPTIONS.map((opt) => {
          const active = lens === opt.value
          return (
            <button
              key={String(opt.value)}
              role="radio"
              aria-checked={active}
              onClick={() => onLensChange(opt.value)}
              className={[
                'rounded py-0.5 text-[10px] font-mono uppercase tracking-wide transition-all',
                // Tuck tighter once the search field claims its share of the row.
                expanded ? 'px-1' : 'px-2.5',
                active
                  ? 'bg-live/15 text-live'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60',
              ].join(' ')}
            >
              {opt.label}
            </button>
          )
        })}
      </div>

      <div
        className="flex flex-1 items-center justify-end gap-1"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => { setHovered(false); setHoverSuppressed(false) }}
      >
        <div
          className={[
            'flex-1 overflow-hidden transition-all duration-200',
            expanded ? 'max-w-full opacity-100' : 'max-w-0 opacity-0',
          ].join(' ')}
        >
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={handleBlur}
            placeholder="Search by name"
            aria-label="Search patterns by name"
            tabIndex={expanded ? 0 : -1}
            className="w-full rounded bg-zinc-800/60 py-0.5 px-2 text-[11px] text-zinc-200 placeholder:text-zinc-500 outline-none focus:bg-zinc-800 focus:ring-1 focus:ring-zinc-600"
          />
        </div>
        <button
          onClick={toggle}
          // Keep focus on the input through the click so closing it here goes through
          // `toggle` (committed-open ⇒ Close) rather than racing the input's blur-close.
          onMouseDown={(e) => e.preventDefault()}
          // Only a committed-open box offers Close; a mere hover-preview still reads as
          // "Search by name" and a click there opens+focuses rather than closes.
          title={committedOpen ? 'Close search' : 'Search by name'}
          aria-label={committedOpen ? 'Close search' : 'Search by name'}
          className={[
            'shrink-0 transition-colors',
            expanded ? 'text-zinc-300 hover:text-live' : 'text-zinc-500 hover:text-zinc-300',
          ].join(' ')}
        >
          {committedOpen ? <X size={13} /> : <Search size={13} />}
        </button>
      </div>
    </div>
  )
}

function ListItem({
  label,
  active,
  dim,
  subItem,
  onFork,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: {
  label: string
  active: boolean
  dim?: string
  subItem?: boolean
  onFork?: () => void
  onClick: () => void
  onMouseEnter?: (e: React.MouseEvent<HTMLLIElement>) => void
  onMouseLeave?: () => void
}) {
  return (
    <li
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{ paddingLeft: subItem ? ROW_PAD_SUB : ROW_PAD_FIRST }}
      className={rowClass(active)}
    >
      {active && <ActiveBar />}
      <span className="flex-1 min-w-0 truncate">{label}</span>
      {dim && <DimPill dim={dim} />}
      {onFork && (
        <span className="absolute right-2 top-0 bottom-0 flex items-center opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={(e) => { e.stopPropagation(); onFork() }}
            title="Fork to an editable pattern"
            aria-label="Fork to an editable pattern"
            className="text-zinc-500 hover:text-live text-xs px-0.5"
          >
            ✎
          </button>
        </span>
      )}
    </li>
  )
}

// A selectable, in-place-renamable, deletable list row shared by "Your Patterns"
// and "Your Maps" (#141). `noun` only varies the rename-conflict / delete copy.
function EditableListItem({
  name,
  noun,
  active,
  dim,
  takenNames,
  onSelect,
  onRename,
  onDelete,
}: {
  name: string
  noun: 'pattern' | 'map'
  active: boolean
  dim?: string
  takenNames: string[]
  onSelect: () => void
  onRename: (name: string) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const [conflict, setConflict] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation()
    setDraft(name)
    setConflict(false)
    setEditing(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  function commitRename() {
    const trimmed = draft.trim()
    if (!trimmed) { setEditing(false); return }
    if (trimmed === name) { setEditing(false); return }
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
        style={{ paddingLeft: ROW_PAD_FIRST }}
        className={rowClass(active)}
      >
        {active && <ActiveBar />}
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
              'flex-1 min-w-0 text-xs px-1 rounded outline-none',
              conflict
                ? 'bg-red-900/60 text-red-200 ring-1 ring-red-500'
                : 'bg-zinc-700 text-zinc-100',
            ].join(' ')}
            title={conflict ? `A ${noun} with that name already exists` : undefined}
          />
        ) : (
          <>
            <span className="flex-1 min-w-0 truncate">{name}</span>
            {dim && <DimPill dim={dim} />}
            <span className="absolute right-2 top-0 bottom-0 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                onClick={startEdit}
                className="text-zinc-500 hover:text-zinc-300 text-xs px-0.5"
                title="Rename"
                aria-label="Rename"
              >
                ✎
              </button>
              <AlertDialogTrigger asChild>
                <button
                  onClick={(e) => e.stopPropagation()}
                  className="text-zinc-500 hover:text-red-400 text-xs px-0.5"
                  title="Delete"
                  aria-label="Delete"
                >
                  ✕
                </button>
              </AlertDialogTrigger>
            </span>
          </>
        )}
      </li>
      <AlertDialogContent>
        <AlertDialogTitle>Delete {noun}?</AlertDialogTitle>
        <AlertDialogDescription>
          "{name}" will be permanently deleted and cannot be recovered.
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
  const activeDemoName = usePatternStore((s) => s.activeDemoName)
  const activePatternId = usePatternStore((s) => s.activePatternId)
  const userPatterns = usePatternStore((s) => s.userPatterns)
  const setActiveDemo = usePatternStore((s) => s.setActiveDemo)
  const setActivePattern = usePatternStore((s) => s.setActivePattern)
  const loadPatterns = usePatternStore((s) => s.loadPatterns)
  const renamePattern = usePatternStore((s) => s.renamePattern)
  const removePattern = usePatternStore((s) => s.removePattern)
  const addPattern = usePatternStore((s) => s.addPattern)

  const userMaps = useMapStore((s) => s.userMaps)
  const renameMap = useMapStore((s) => s.renameMap)
  const removeMap = useMapStore((s) => s.removeMap)
  const editingMap = useMapStore((s) => s.editingMap)
  const createNewMap = useMapStore((s) => s.createNewMap)
  const openExistingMap = useMapStore((s) => s.openExistingMap)
  const closeMapEditor = useMapStore((s) => s.closeMapEditor)

  // Open-from-disk (.epe import) lives next to "New pattern" (#141): both create
  // a pattern, so they sit together on the "Your Patterns" header.
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const importErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (importErrorTimerRef.current) clearTimeout(importErrorTimerRef.current) }, [])

  function showImportError(msg: string) {
    setImportError(msg)
    if (importErrorTimerRef.current) clearTimeout(importErrorTimerRef.current)
    importErrorTimerRef.current = setTimeout(() => setImportError(null), 4000)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const text = ev.target?.result
      if (typeof text !== 'string') return
      let parsed
      try {
        parsed = parseEpe(text)
      } catch (err) {
        showImportError(err instanceof Error ? err.message : 'Failed to import EPE file')
        return
      }
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const name = uniquePatternName(parsed.name, userPatterns.map((p) => p.name))
      const record: PatternRecord = { id, name, src: parsed.src, controls: {}, updatedAt: Date.now() }
      await addPattern(record)
      useMapStore.getState().closeMapEditor()
      setActivePattern(id)
      setSource(record.src)
      setPreviewSource(record.src)
      setPreviewPatternName(record.name)
      setIsReadOnly(false)
    }
    reader.readAsText(file)
  }

  // The dimension lens (#251). Ephemeral: component state, resets to All on reload.
  const [dimLens, setDimLens] = useState<DimLens>('all')
  // The type-down name search (#252). Ephemeral too: resets to '' on reload.
  const [query, setQuery] = useState('')

  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})

  useEffect(() => {
    // Hydrate user maps (and seed the stock custom maps, #140) so the layout
    // selector is populated before the first pattern opens.
    useMapStore.getState().loadMaps()
  }, [])

  useEffect(() => {
    void usePatternStore.getState().loadDemoOverrides()
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

  function openDemo(name: string) {
    closeMapEditor()
    setActiveDemo(name)
    setSource(DEMOS[name])
    setPreviewSource(DEMOS[name])
    setPreviewPatternName(name)
    setIsReadOnly(true)
  }

  // Fork a demo into an editable user pattern (#182): the per-row "edit" action in
  // the Demos list. Mirrors the top-bar "Edit" fork, but for any demo without first
  // having to open it.
  async function handleForkDemo(name: string) {
    closeMapEditor()
    const newName = uniquePatternName(name, userPatterns.map((p) => p.name))
    const record = newPatternRecord(newName, DEMOS[name])
    // Snapshot the demo's effective settings as frozen layer-1 overrides
    // so the fork keeps the demo's curated look with no live pointer back to it.
    record.settings = forkSettingsSnapshotForDemo(name)
    await addPattern(record)
    setActivePattern(record.id)
    setSource(record.src)
    setPreviewSource(record.src)
    setPreviewPatternName(record.name)
    setIsReadOnly(false)
  }

  function openUserPattern(pattern: PatternRecord) {
    closeMapEditor()
    setActivePattern(pattern.id)
    setSource(pattern.src)
    setPreviewSource(pattern.src)
    setPreviewPatternName(pattern.name)
    setIsReadOnly(false)
  }

  // Create a fresh "Untitled Pattern" and open it. Lives next to "Your Patterns"
  // (#141) so a new pattern is created right by its list.
  async function handleCreatePattern() {
    closeMapEditor()
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const name = uniquePatternName('Untitled Pattern', userPatterns.map((p) => p.name))
    const record: PatternRecord = { id, name, src: NEW_PATTERN_SRC, controls: {}, updatedAt: Date.now() }
    await addPattern(record)
    setActivePattern(id)
    setSource(record.src)
    setPreviewSource(record.src)
    setPreviewPatternName(record.name)
    setIsReadOnly(false)
  }

  // Open a custom map in editor map mode (#151): loads its source, flips the
  // editor to the JS map flavor, and drives the bare-geometry preview.
  function openUserMap(map: MapRecord) {
    openExistingMap(map)
  }

  // An active name search force-expands every group: a hit inside a collapsed group
  // must still surface (#252 follow-up). The stored collapse state is left untouched,
  // so groups snap back to the user's chosen open/closed layout when the query clears.
  const searching = query.trim() !== ''
  const isCollapsed = (label: string) => !searching && !!collapsedSections[label]
  const toggleCollapsed = (label: string) =>
    setCollapsedSections((c) => ({ ...c, [label]: !c[label] }))

  return (
    <div className="flex flex-col h-full text-xs font-mono">
      <input
        ref={fileInputRef}
        type="file"
        accept=".epe"
        className="hidden"
        onChange={handleFileChange}
      />
      <RailFilterBar
        lens={dimLens}
        onLensChange={setDimLens}
        query={query}
        onQueryChange={setQuery}
      />
      <SectionHeader
        label="Your Patterns"
        first
        collapsed={isCollapsed('Your Patterns')}
        onToggle={() => toggleCollapsed('Your Patterns')}
        action={
          <>
            <HeaderAction
              icon={<FolderOpen size={14} />}
              title="Open pattern from .epe file"
              onClick={() => fileInputRef.current?.click()}
            />
            <HeaderAction icon={<Plus size={14} />} title="New pattern" onClick={handleCreatePattern} />
          </>
        }
      />
      {importError && (
        <p className="pl-3 pr-3 py-1 text-red-400 truncate" title={importError}>{importError}</p>
      )}
      {!isCollapsed('Your Patterns') && (
        <ul>
          {userPatterns
            .filter(
              (pattern) =>
                matchesLens(nativeDim(pattern.src), dimLens) && matchesQuery(pattern.name, query),
            )
            .map((pattern) => (
            <EditableListItem
              key={pattern.id}
              name={pattern.name}
              noun="pattern"
              active={activePatternId === pattern.id}
              dim={dimLens === 'all' ? `${nativeDim(pattern.src)}D` : undefined}
              takenNames={userPatterns.filter((p) => p.id !== pattern.id).map((p) => p.name)}
              onSelect={() => openUserPattern(pattern)}
              onRename={(name) => renamePattern(pattern.id, name)}
              onDelete={() => removePattern(pattern.id)}
            />
          ))}
        </ul>
      )}

      {/* Your Maps is mapless by construction under the 1D lens (1D is reached via
          viewport shapes, not maps), so the whole section is hidden there (#251). */}
      {dimLens !== 1 && (() => {
        const visibleMaps = userMaps.filter(
          (map) => matchesLens(map.dim, dimLens) && matchesQuery(map.name, query),
        )
        return (
          <>
            <SectionHeader
              label="Your Maps"
              collapsed={isCollapsed('Your Maps')}
              onToggle={() => toggleCollapsed('Your Maps')}
              action={<HeaderAction icon={<Plus size={14} />} title="New map" onClick={createNewMap} />}
            />
            {!isCollapsed('Your Maps') && (
              // The "no maps yet" empty state only fits when the user genuinely has no
              // maps. If a filter (lens or query) merely emptied the list, leave just
              // the header — the message would misread as "you have none" (#252).
              visibleMaps.length === 0 ? (
                userMaps.length === 0 ? (
                  <p className="pl-3 pr-3 py-1 text-zinc-600 italic select-none">No custom maps yet</p>
                ) : null
              ) : (
                <ul>
                  {visibleMaps.map((map) => (
                    <EditableListItem
                      key={map.id}
                      name={map.name}
                      noun="map"
                      active={editingMap?.kind === 'existing' && editingMap.id === map.id}
                      dim={dimLens === 'all' ? `${map.dim}D` : undefined}
                      takenNames={userMaps.filter((m) => m.id !== map.id).map((m) => m.name)}
                      onSelect={() => openUserMap(map)}
                      onRename={(name) => renameMap(map.id, name)}
                      onDelete={() => removeMap(map.id)}
                    />
                  ))}
                </ul>
              )
            )}
          </>
        )
      })()}

      <SectionHeader
        label="Demos"
        collapsed={isCollapsed('Demos')}
        onToggle={() => toggleCollapsed('Demos')}
      />
      {!isCollapsed('Demos') &&
        DEMO_SECTIONS.map((section) => {
          // Under a dimension lens, drop non-matching demos and hide any subsection
          // that ends up empty — no empty headers (#251).
          const names = section.names.filter(
            (name) =>
              matchesLens(nativeDim(DEMOS[name] ?? ''), dimLens) && matchesQuery(name, query),
          )
          if (names.length === 0) return null
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
                  {names.map((name) => (
                    <ListItem
                      key={name}
                      label={name}
                      subItem
                      dim={dimLens === 'all' ? `${nativeDim(DEMOS[name] ?? '')}D` : undefined}
                      active={activeDemoName === name}
                      onClick={() => openDemo(name)}
                      onFork={() => handleForkDemo(name)}
                    />
                  ))}
                </ul>
              )}
            </div>
          )
        })}
    </div>
  )
}
