import { useEffect, useState, useSyncExternalStore } from 'react'
import { RotateCw, Check, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getControllerProvider } from '@/engine/controllerProviderRegistry'
import { useControllerStore } from '@/store/controllerStore'
import { useMapStore } from '@/store/mapStore'
import { describeSendMap } from '@/engine/sendToController'
import type { PreflightWarning } from '@/engine/preflight'
import {
  PushConfirmPopover,
  PreflightWarningList,
  pushPopoverButton,
} from '@/components/PushConfirmPopover'

const checkbox = 'h-3.5 w-3.5 shrink-0 accent-amber-400'

// The map-push popover body. Mounted only while the popover is open (the parent renders
// it as the popover's children, which PushConfirmPopover gates on `open`), so its
// default-checked checkbox state is re-armed on every open with no reset logic.
//
// On a blocking count mismatch (#213) the map can't conform to the device, so the two
// coupled steps — "Push map" and "Push pixel count" — are offered as checkboxes, both on
// by default (the recommended pairing). Unchecking pushes just one; with both off the
// Push button greys out. Without a mismatch there's no count step: a plain Push.
function MapPushChoices({
  blocking,
  mismatch,
  overwrite,
  onCancel,
  confirmMapPush,
  confirmMapPushOnly,
  confirmSetPixelCountOnly,
}: {
  blocking: boolean
  mismatch?: PreflightWarning
  overwrite?: PreflightWarning
  onCancel: () => void
  confirmMapPush: () => Promise<void>
  confirmMapPushOnly: () => Promise<void>
  confirmSetPixelCountOnly: () => Promise<void>
}) {
  const [pushMap, setPushMap] = useState(true)
  const [setCount, setSetCount] = useState(true)

  const pushDisabled = blocking && !pushMap && !setCount
  const onPush = () => {
    if (!blocking || (pushMap && setCount)) return void confirmMapPush()
    if (pushMap) return void confirmMapPushOnly()
    return void confirmSetPixelCountOnly()
  }

  return (
    <>
      <PreflightWarningList warnings={[mismatch, overwrite].filter(Boolean) as PreflightWarning[]} />

      {blocking && (
        <fieldset className="mt-3 space-y-1.5">
          <legend className="text-zinc-500">Recommended</legend>
          <label className="flex items-center gap-2 text-zinc-300">
            <input
              type="checkbox"
              className={checkbox}
              checked={pushMap}
              onChange={(e) => setPushMap(e.target.checked)}
            />
            Push map
          </label>
          <label className="flex items-center gap-2 text-zinc-300">
            <input
              type="checkbox"
              className={checkbox}
              checked={setCount}
              onChange={(e) => setSetCount(e.target.checked)}
            />
            Push pixel count
          </label>
        </fieldset>
      )}

      <div className="mt-3 flex justify-end gap-2">
        <button type="button" className={pushPopoverButton.cancel} onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className={pushPopoverButton.action}
          disabled={pushDisabled}
          onClick={onPush}
        >
          Push
        </button>
      </div>
    </>
  )
}

// The map-editor "Send to Controller" action (H12, issue #204) — the map analogue of
// SendToController. It writes the open custom map's baked coordinate array to the
// Controller's single shared map slot, "configuring the installation, not the pattern."
//
// A thin shell over the pure `describeSendMap` gate and the store's map-push flow:
// `requestMapPush` always opens the preflight popover (writing the shared map is a
// deliberate act — never a silent one-click), and `confirmMapPush` performs the write.
// The button reuses the shared `pushing`/`pushResult`/`preflight` slices (map mode and
// pattern mode are mutually exclusive in the editor header, so only one Send is mounted).
export function SendMapToController() {
  const provider = getControllerProvider()
  const status = useSyncExternalStore(
    (onChange) => provider.subscribe(onChange),
    () => provider.getStatus(),
  )

  // The map open for editing, resolved to its dirty-gate inputs.
  const editingMap = useMapStore((s) => s.editingMap)
  const userMaps = useMapStore((s) => s.userMaps)
  const openRecord =
    editingMap?.kind === 'existing' ? userMaps.find((m) => m.id === editingMap.id) : undefined
  const mapId = openRecord?.id
  const hasBakedPoints = (openRecord?.points?.length ?? 0) > 0
  const signature = openRecord?.source ?? ''

  const activeIp = useControllerStore((s) => s.activeIp)
  const active = useControllerStore((s) => (s.activeIp ? s.controllers[s.activeIp] : undefined))
  const pushing = useControllerStore((s) => s.pushing)
  const pushResult = useControllerStore((s) => s.pushResult)
  const lastPushedMap = useControllerStore((s) => s.lastPushedMap)
  const requestMapPush = useControllerStore((s) => s.requestMapPush)
  const confirmMapPush = useControllerStore((s) => s.confirmMapPush)
  const confirmMapPushOnly = useControllerStore((s) => s.confirmMapPushOnly)
  const confirmSetPixelCountOnly = useControllerStore((s) => s.confirmSetPixelCountOnly)
  const cancelPush = useControllerStore((s) => s.cancelPush)
  const preflight = useControllerStore((s) => s.preflight)
  const mapPushRemedyCount = useControllerStore((s) => s.mapPushRemedyCount)
  const clearPushResult = useControllerStore((s) => s.clearPushResult)

  // Hold the just-pushed check on screen briefly, then settle back to the idle arrow.
  useEffect(() => {
    if (!pushResult) return
    const t = setTimeout(clearPushResult, 3500)
    return () => clearTimeout(t)
  }, [pushResult, clearPushResult])

  // Dirty gate: a push is redundant when the open map's current bake already matches
  // what was last written to this Controller.
  const alreadyPushed =
    !!activeIp && !!mapId && hasBakedPoints && lastPushedMap[activeIp]?.[mapId] === signature

  const { enabled, reason } = describeSendMap({ status, hasBakedPoints, alreadyPushed })

  const target = active ? active.nickname || activeIp : null
  const name = target ?? 'Controller'

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

  const working = pushing || !!pushResult?.ok
  const dimClass = working ? 'opacity-95' : 'disabled:opacity-30'

  const open = preflight !== null
  const blocking = mapPushRemedyCount !== null
  const mismatch = (preflight ?? []).find((w) => w.kind === 'map-count-mismatch')
  const overwrite = (preflight ?? []).find((w) => w.kind === 'map-overwrite')

  // Map preflight (#204): the popover always opens on a map send (the overwrite warning
  // always fires), so closing it any way cancels; only the explicit action writes. The
  // body lives in MapPushChoices, mounted only while open so its checkboxes re-arm.
  return (
    <PushConfirmPopover
      open={open}
      onCancel={cancelPush}
      title="Push map"
      testId="map-preflight-dialog"
      anchor={
        <Button
          size="sm"
          variant="ghost"
          className={`text-xs text-zinc-400 bg-zinc-800/70 hover:bg-zinc-700/70 hover:text-zinc-300 ${dimClass}`}
          disabled={!enabled || working}
          title={title}
          onClick={() => void requestMapPush()}
          data-testid="send-map-to-controller"
        >
          {content}
        </Button>
      }
    >
      <MapPushChoices
        blocking={blocking}
        mismatch={mismatch}
        overwrite={overwrite}
        onCancel={cancelPush}
        confirmMapPush={confirmMapPush}
        confirmMapPushOnly={confirmMapPushOnly}
        confirmSetPixelCountOnly={confirmSetPixelCountOnly}
      />
    </PushConfirmPopover>
  )
}
