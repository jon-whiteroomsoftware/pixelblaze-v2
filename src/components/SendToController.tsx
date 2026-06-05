import { useEffect, useSyncExternalStore } from 'react'
import { RotateCw, Check, Play, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getControllerProvider } from '@/engine/controllerProviderRegistry'
import { useControllerStore } from '@/store/controllerStore'
import { useEditorStore } from '@/store/editorStore'
import { usePatternStore } from '@/store/patternStore'
import { describeSendToController, isAlreadyPushed, describeSendAction } from '@/engine/sendToController'

// The editor-header "Send to Controller" action (H9 #201 → H10 #202; save mode #236,
// run-vs-save toggle #238). One verb that plays *or* saves the open pattern on the
// connected Controller: the extension compiles the bundled artifact to bytecode and the
// page frames it over the existing socket. A sticky Save toggle (#238) picks run-only
// (play) vs persisted (save) mode; the button glyph/tooltip reflect it.
//
// A thin shell over the pure gates: `describeSendToController` decides enablement and
// `isAlreadyPushed` the mode-split dirty gate; `requestPush` pushes straight through (a
// pattern push has no preflight — #239 removed the misleading preview-vs-device count
// warning; the device runs the pattern on its own pixels + map).

export function SendToController() {
  const provider = getControllerProvider()
  const status = useSyncExternalStore(
    (onChange) => provider.subscribe(onChange),
    () => provider.getStatus(),
  )
  const patternDim = useEditorStore((s) => s.nativeDim)
  const compileStatus = useEditorStore((s) => s.compileStatus)
  const previewSource = useEditorStore((s) => s.previewSource)
  const patternId = usePatternStore((s) => s.activePatternId)
  // Target the active Controller (#210): the gate + label key off its entry.
  const activeIp = useControllerStore((s) => s.activeIp)
  const active = useControllerStore((s) => (s.activeIp ? s.controllers[s.activeIp] : undefined))
  const mapDim = active?.mapDim ?? null
  const pushing = useControllerStore((s) => s.pushing)
  const pushResult = useControllerStore((s) => s.pushResult)
  const lastPushedSource = useControllerStore((s) => s.lastPushedSource)
  const lastSavedSource = useControllerStore((s) => s.lastSavedSource)
  const saveArmed = useControllerStore((s) => s.saveArmed)
  const setSaveArmed = useControllerStore((s) => s.setSaveArmed)
  const requestPush = useControllerStore((s) => s.requestPush)
  const clearPushResult = useControllerStore((s) => s.clearPushResult)

  // Hold the just-pushed check on screen (button inert) for a few seconds, then let
  // it settle back to the idle arrow — which the dirty gate then keeps disabled
  // until the pattern is edited again.
  useEffect(() => {
    if (!pushResult) return
    const t = setTimeout(clearPushResult, 3500)
    return () => clearTimeout(t)
  }, [pushResult, clearPushResult])

  // The dirty gate, split by armed mode (#238): a push is redundant when the open
  // pattern's current clean source already matches what was last pushed to this
  // Controller *in this mode*. Run and save are distinct acts, so arming the other
  // mode after a clean push re-enables Send.
  const mode = saveArmed ? 'save' : 'run'
  const alreadyPushed =
    !!activeIp &&
    !!patternId &&
    isAlreadyPushed({
      mode,
      source: previewSource,
      lastRunSource: lastPushedSource[activeIp]?.[patternId],
      lastSavedSource: lastSavedSource[activeIp]?.[patternId],
    })

  const { enabled, reason } = describeSendToController({
    status,
    patternDim,
    mapDim,
    compileStatus,
    alreadyPushed,
  })
  // The button names the active Controller: a leading glyph + the Controller's name
  // (nickname, else IP, else a generic word). Only the glyph morphs — Play/Save (idle,
  // per the armed mode #238) → spinner (pushing) → check (done) — so the name holds
  // its place and the button keeps its width.
  const target = active ? active.nickname || activeIp : null
  const name = target ?? 'Controller'

  // Idle glyph reflects the armed mode (#238): Play (run on device) / Save (persist).
  // Amber spinner → working; check → landed. The error case is the only one that swaps
  // the text, transiently. When enabled and idle, the tooltip names the mode action
  // ("Play on <name>" / "Save to <name>"); the gate's reason wins when disabled.
  let title = enabled ? describeSendAction(mode, name).tooltip : reason
  let glyph = saveArmed ? (
    <Save size={14} strokeWidth={2.75} aria-hidden />
  ) : (
    <Play size={14} strokeWidth={2.75} aria-hidden />
  )
  if (pushing) {
    glyph = (
      <RotateCw size={14} strokeWidth={2.75} className="animate-spin text-amber-400" aria-hidden />
    )
  } else if (pushResult?.ok) {
    glyph = <Check size={14} strokeWidth={2.75} aria-hidden />
  }

  let content = (
    <span className="flex items-center gap-1.5">
      {glyph}
      {name}
    </span>
  )
  if (!pushing && pushResult && !pushResult.ok) {
    content = <span>Send failed</span>
    title = pushResult.message
  }

  // The button is inert (no click) while a push runs AND through the brief check
  // afterwards, but those "working/just-finished" states should read as active, not
  // "unavailable" — so only the gate-disabled state takes the heavy 30% dim. The
  // working states barely dim (the amber spinner / check carries them).
  const working = pushing || !!pushResult?.ok
  const dimClass = working ? 'opacity-95' : 'disabled:opacity-30'

  // The sticky Save toggle (#238): always visible (never a hidden mode), immediately
  // left of the Send button. Armed → Send persists to Saved Patterns; off → run-only.
  const saveToggle = (
    <button
      type="button"
      role="switch"
      aria-checked={saveArmed}
      aria-label="Save to Controller"
      title={saveArmed ? 'Saving: Send persists to the Controller' : 'Arm to save the pattern on the Controller'}
      onClick={() => setSaveArmed(!saveArmed)}
      data-testid="save-toggle"
      className={`flex items-center gap-1 rounded px-1.5 py-1 text-xs transition-colors ${
        saveArmed
          ? 'bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'
          : 'text-zinc-500 hover:bg-zinc-800/70 hover:text-zinc-300'
      }`}
    >
      <Save size={13} strokeWidth={2.5} aria-hidden />
    </button>
  )

  // A pattern push goes straight through (no preflight, #239), so the button is a plain
  // action — the click pushes immediately.
  return (
    <span className="flex items-center gap-1">
      {saveToggle}
      <Button
        size="sm"
        variant="ghost"
        className={`text-xs text-zinc-400 bg-zinc-800/70 hover:bg-zinc-700/70 hover:text-zinc-300 ${dimClass}`}
        disabled={!enabled || working}
        title={title}
        onClick={() => void requestPush()}
        data-testid="send-to-controller"
      >
        {content}
      </Button>
    </span>
  )
}
