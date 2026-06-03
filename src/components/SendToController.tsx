import { useEffect, useSyncExternalStore } from 'react'
import { RotateCw, Check, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getControllerProvider } from '@/engine/controllerProviderRegistry'
import { useControllerStore } from '@/store/controllerStore'
import { useEditorStore } from '@/store/editorStore'
import { usePatternStore } from '@/store/patternStore'
import { describeSendToController } from '@/engine/sendToController'
import {
  AlertDialogRoot,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'

// The editor-header "Send to Controller" action (H9 #201 → H10 #202 → H11 #203). One
// verb that runs *and* stores the open pattern on the connected Controller,
// overwrite-in-place: the extension compiles the bundled artifact to bytecode, the
// page frames it and pushes it over the existing socket (save + run), and the
// per-Controller binding is remembered so the next push overwrites the same program.
//
// A thin shell over the pure gates: `describeSendToController` decides enablement;
// `requestPush` runs the #203 preflight (pixel-count reconciliation) and either
// pushes straight through (clean) or opens the reconciliation dialog (any warning),
// deferring the push to `confirmPush`. The store's `preflight` slice drives the dialog.

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
  const requestPush = useControllerStore((s) => s.requestPush)
  const confirmPush = useControllerStore((s) => s.confirmPush)
  const cancelPush = useControllerStore((s) => s.cancelPush)
  const preflight = useControllerStore((s) => s.preflight)
  const clearPushResult = useControllerStore((s) => s.clearPushResult)

  // Hold the just-pushed check on screen (button inert) for a few seconds, then let
  // it settle back to the idle arrow — which the dirty gate then keeps disabled
  // until the pattern is edited again.
  useEffect(() => {
    if (!pushResult) return
    const t = setTimeout(clearPushResult, 3500)
    return () => clearTimeout(t)
  }, [pushResult, clearPushResult])

  // The dirty gate: a push is redundant when the open pattern's current clean source
  // already matches what was last pushed to this Controller for this pattern.
  const alreadyPushed =
    !!activeIp &&
    !!patternId &&
    previewSource.length > 0 &&
    lastPushedSource[activeIp]?.[patternId] === previewSource

  const { enabled, reason } = describeSendToController({
    status,
    patternDim,
    mapDim,
    compileStatus,
    alreadyPushed,
  })
  // The button reads as a motion *toward* the active Controller: a leading glyph +
  // the Controller's name (nickname, else IP, else a generic word). Only the glyph
  // morphs — arrow (idle) → spinner (pushing) → check (done) — so the name holds its
  // place and the button keeps its width.
  const target = active ? active.nickname || activeIp : null
  const name = target ?? 'Controller'

  // arrow → "going toward"; amber spinner → working; check → landed. The error case
  // is the only one that swaps the text, transiently.
  let title = reason
  let glyph = <ArrowRight size={14} strokeWidth={2.75} aria-hidden />
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

  return (
    <>
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

      {/* Preflight reconciliation (#203): only mounted when the push surfaced a
          warning. Closing it any way (Cancel, Escape, overlay) cancels the push;
          only the explicit action proceeds. */}
      <AlertDialogRoot
        open={preflight !== null}
        onOpenChange={(open) => {
          if (!open) cancelPush()
        }}
      >
        <AlertDialogContent data-testid="preflight-dialog">
          <AlertDialogTitle>Send to {name}?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <ul className="mt-1 space-y-1.5">
              {(preflight ?? []).map((w) => (
                <li key={w.kind} className="text-sm text-zinc-400">
                  {w.message}
                </li>
              ))}
            </ul>
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmPush()}>Send anyway</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialogRoot>
    </>
  )
}
