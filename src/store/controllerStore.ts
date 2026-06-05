import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  createControllerProvider,
  setControllerProvider,
  detectControllerExtension,
  discoverControllers,
  getControllerProvider,
} from '@/engine/controllerProviderRegistry'
import {
  ControllerPermissionDeniedError,
  NullControllerProvider,
  type ControllerProvider,
  type ControllerStatus,
  type DiscoveredController,
} from '@/engine/ControllerProvider'
import { mapDimension, type MapDimension } from '@/engine/sendToController'
import { describePreflight, type PreflightWarning } from '@/engine/preflight'
import { resolveMapPushPoints } from '@/engine/mapPush'
import { applyControllerPixelCount } from '@/engine/applyControllerPixelCount'
import type { ControllerPhase } from '@/engine/controllerPillView'
import { pushPattern } from '@/engine/pushPattern'
import { getControllerBindings, setControllerBindings } from '@/engine/storage'
import { bundle } from '@/engine/bundle'
import { LIBRARIES } from '@/pixelblaze/libs'
import { usePatternStore } from '@/store/patternStore'
import { useEditorStore } from '@/store/editorStore'
import { useMapStore } from '@/store/mapStore'
import { useControllerPanelStore } from '@/store/controllerPanelStore'

// Keyed connection orchestration for the live Controller surface (#210).
//
// Reshaped from the single-connection model (#197) to the true seam: extension
// *presence* is global (one extension, one detect), while connection *state* is a
// map of Controllers keyed by IP, exactly one marked active. Each entry carries
// its own phase (pending/live/error), nickname, and installed-map dimensionality.
//
// One isolated provider drives each Controller's socket — minted through the
// registry factory and kept in a module-local map (never serialised). The store
// points the registry's *active* provider (which the Controller panel and Send
// read/drive) at whichever Controller is active. Connection *truth* still lives in
// each provider; this store mirrors a per-Controller slice for the pills and
// remembers the last-connected IP so it alone auto-connects on reload.
//
// The data model is a map from day one (multi-Controller correctness); the header
// renders only the single-Controller affordances richly (polish deferred to #210+).

/** One Controller in the keyed map. Born `pending` on connect-attempt; settles to
 *  `live` (label → nickname) or `error`. `mapDim` gates Send-to-Controller. */
export interface ControllerEntry {
  ip: string
  /** Device name when reported; absent → the pill falls back to the IP. */
  nickname?: string
  phase: ControllerPhase
  /** Last error message when `phase === 'error'`. */
  error?: string
  mapDim: MapDimension
}

interface ControllerConnectionState {
  /** Is the relay extension installed/reachable? Global — drives the entry button's
   *  no-extension vs ready states. */
  extensionPresent: boolean
  /** Connected (or connecting/errored) Controllers, keyed by IP. */
  controllers: Record<string, ControllerEntry>
  /** The IP of the active Controller — the one Send + the panel target. */
  activeIp: string | null
  /** The last Controller to reach `live`, persisted so it alone auto-connects on
   *  reload. Cleared when that Controller is explicitly removed. */
  lastConnectedIp: string | null
  /** The nickname of the last-connected Controller, persisted alongside its IP so the
   *  pill is born with the name on reload rather than the bare IP (#215). Refreshed
   *  from the device's `getConfig` once it reconnects — a rename on the device wins. */
  lastConnectedNickname: string | null
  /** True while a Send-to-Controller push is in flight (#202) — disables the button. */
  pushing: boolean
  /** Last push outcome, surfaced transiently on the Send button. `null` = idle. */
  pushResult: PushResult | null
  /** The pattern source last successfully pushed, keyed controllerId → patternId.
   *  Drives the dirty gate: Send is inert until the source differs from this. Not
   *  persisted — a fresh session re-enables a push (the device may have changed). */
  lastPushedSource: Record<string, Record<string, string>>
  /** The map source last successfully pushed, keyed controllerId → mapId (#204). The
   *  map analogue of `lastPushedSource`: drives the map editor's dirty gate so its Send
   *  is inert until the open map's bake changes. Not persisted (a fresh session re-enables
   *  a push — the device's shared map may have changed under us). */
  lastPushedMap: Record<string, Record<string, string>>
  /** Pending preflight warnings (#203): non-null opens the reconciliation dialog,
   *  which Send must clear (confirm or cancel) before the push proceeds. `null` =
   *  no dialog. An empty array never appears here — a clean preflight pushes
   *  straight through. */
  preflight: PreflightWarning[] | null
  /** When the open map's point count can't conform to the device's `pixelCount`, the
   *  count the Controller must be set to for the map to apply (#213). Non-null marks the
   *  current map preflight as **blocking**: the plain "Send anyway" path is withheld and
   *  the dialog offers only the coupled remedy (set pixel count to this, then push). */
  mapPushRemedyCount: number | null

  /** Controllers surfaced by the last discovery sweep (H14, #206), awaiting connect.
   *  Cleared when discovery re-runs. */
  discovered: DiscoveredController[]
  /** True while a discovery sweep is in flight — drives the dropdown's spinner. */
  discovering: boolean

  /** Probe extension presence and record it (global). */
  detectExtension: () => Promise<boolean>
  /** Run a cloud discovery sweep and record the candidates (#206). Best-effort:
   *  a failure or no helper leaves `discovered` empty. */
  discover: () => Promise<void>
  /** Begin connecting to `ip`: born as a pending pill, made active immediately.
   *  Settles to live (nickname + mapDim read) or error. Re-adding an existing IP
   *  retries it. Rejection is swallowed — the pill reflects the error.
   *  `seedNickname` pre-labels the pending pill (used by auto-reconnect, #215); it is
   *  overwritten once the device reports its real name. */
  addController: (ip: string, seedNickname?: string) => Promise<void>
  /** Disconnect + drop a Controller. If it was active, activates another (or none).
   *  Clears the remembered last-connected IP if it was this one. */
  removeController: (ip: string) => Promise<void>
  /** Make `ip` the active Controller (points the registry's active provider at it). */
  setActive: (ip: string) => void
  /** Startup auto-reconnect: try only the remembered last-connected Controller. */
  autoConnect: () => Promise<void>
  /** Compile + push the active pattern to the active Controller, overwrite-in-place
   *  (#202). Reads the last-clean preview source and active pattern id; a no-op when
   *  nothing is active. Sets `pushing`/`pushResult` for the button to reflect. */
  pushActivePattern: () => Promise<void>
  /** Run the Send-to-Controller preflight (#203): reconcile the open pattern's
   *  modeled pixel count against the Controller's configured count. A clean preflight
   *  pushes straight through (preserving the one-click path); any warning opens the
   *  reconciliation dialog (`preflight`) instead, deferring the push to confirmPush. */
  requestPush: () => Promise<void>
  /** Acknowledge the preflight dialog and proceed with the push. */
  confirmPush: () => Promise<void>
  /** Dismiss the preflight dialog without pushing. */
  cancelPush: () => void
  /** Run the map-send preflight (#204): reconcile the open map's baked point count
   *  against the Controller's configured pixel count and always surface the map-overwrite
   *  warning (writing the shared map is a deliberate act). Opens the reconciliation
   *  dialog (`preflight`), deferring the write to confirmMapPush. A no-op when no map
   *  is open or no Controller is active. */
  requestMapPush: () => Promise<void>
  /** Acknowledge the map preflight dialog and write the map to the Controller. When the
   *  preflight is blocking (`mapPushRemedyCount` set — the map can't conform to the
   *  device count), this first sets the Controller's pixel count to that remedy count,
   *  then pushes; otherwise it's a plain write. The coupled set-count-then-push is the
   *  only thing that makes a fixed-count map apply (#213). */
  confirmMapPush: () => Promise<void>
  /** Push the map *without* the coupled setPixelCount — the escape hatch offered
   *  alongside the remedy on a blocking mismatch (#213). The firmware will silently drop
   *  a count-mismatched map, so this is the deliberate "I know, push it anyway" path; the
   *  remedy (`confirmMapPush`) stays the recommended default. */
  confirmMapPushOnly: () => Promise<void>
  /** Set the Controller's pixel count to the remedy count *without* pushing the map —
   *  the combination chosen when the map-push popover's "Push map" box is unchecked but
   *  "Push pixel count" is left on. No-op when there's no armed remedy (#213). */
  confirmSetPixelCountOnly: () => Promise<void>
  /** Write the open map's baked coordinates to the active Controller's single shared
   *  map slot (#204). Reuses `pushing`/`pushResult` for the button animation; a no-op
   *  when nothing is open/active. */
  pushActiveMap: () => Promise<void>
  /** Clear the transient push result (e.g. after the toast/badge times out). */
  clearPushResult: () => void
}

/** The outcome of a single Send-to-Controller push, surfaced on the button. */
export type PushResult =
  | { ok: true; created: boolean }
  | { ok: false; message: string }

export const controllerInitialState = {
  extensionPresent: false,
  controllers: {} as Record<string, ControllerEntry>,
  activeIp: null as string | null,
  lastConnectedIp: null as string | null,
  lastConnectedNickname: null as string | null,
  pushing: false,
  pushResult: null as PushResult | null,
  lastPushedSource: {} as Record<string, Record<string, string>>,
  lastPushedMap: {} as Record<string, Record<string, string>>,
  preflight: null as PreflightWarning[] | null,
  mapPushRemedyCount: null as number | null,
  discovered: [] as DiscoveredController[],
  discovering: false,
}

// Live provider per Controller IP, plus each one's status unsubscribe. Kept
// module-local so they never serialise and a stale render never holds a socket.
const providers = new Map<string, ControllerProvider>()
const unsubscribers = new Map<string, () => void>()

/** Map a provider status to the keyed entry's mirrored fields. The nickname is
 *  only ever *set* (when the status carries a device name), never cleared — it is
 *  fetched once via getConfig on connect and must survive a transient reconnect,
 *  which re-emits connecting/connected without a name. */
function phaseFromStatus(status: ControllerStatus): Partial<ControllerEntry> | null {
  switch (status.kind) {
    case 'connecting':
      return { phase: 'pending', error: undefined }
    case 'connected':
      return {
        phase: 'live',
        error: undefined,
        ...(status.controller.name ? { nickname: status.controller.name } : {}),
      }
    case 'error':
      return { phase: 'error', error: status.message }
    default:
      // extension-present / no-extension aren't entry states; ignore.
      return null
  }
}

export const useControllerStore = create<ControllerConnectionState>()(
  persist(
    (set, get) => {
      // Resolve the map currently open in the editor's map mode into the bits a push
      // needs: its stable id, baked coordinate array, and a change signature (its
      // source) for the dirty gate. Returns null unless a custom map is open AND has
      // baked points — a stock map (no source) or an unbaked map can't be pushed.
      const openMapForPush = ():
        | { id: string; points: number[][]; source: string | undefined; signature: string }
        | null => {
        const { editingMap, userMaps } = useMapStore.getState()
        if (editingMap?.kind !== 'existing') return null
        const record = userMaps.find((m) => m.id === editingMap.id)
        if (!record || !record.points || record.points.length === 0) return null
        // `points` are baked at the *preview* count; the push re-bakes `source` to the
        // device's pixel count (resolveMapPushPoints, #204). `signature` is the source
        // text used by the dirty gate.
        return {
          id: record.id,
          points: record.points,
          source: record.source ?? undefined,
          signature: record.source ?? '',
        }
      }

      // Fold a per-Controller patch into the keyed map without dropping siblings.
      const patchController = (ip: string, patch: Partial<ControllerEntry>) =>
        set((s) => {
          const existing = s.controllers[ip]
          if (!existing) return s
          return { controllers: { ...s.controllers, [ip]: { ...existing, ...patch } } }
        })

      return {
        ...controllerInitialState,

        detectExtension: async () => {
          const present = await detectControllerExtension().catch(() => false)
          set({ extensionPresent: present })
          return present
        },

        discover: async () => {
          // Re-entrancy guard: auto-on-open, the periodic tick, and the manual
          // refresh affordance can all fire — never let two sweeps overlap.
          if (get().discovering) return
          set({ discovering: true })
          const found = await discoverControllers().catch(() => [])
          // Drop already-connected Controllers from the candidate list — connecting
          // to one again is the manual-IP path's job, not discovery's.
          const connected = get().controllers
          set({
            discovered: found.filter((c) => !connected[c.address]),
            discovering: false,
          })
        },

        setActive: (ip) => {
          set({ activeIp: ip })
          setControllerProvider(providers.get(ip) ?? new NullControllerProvider())
        },

        addController: async (ip, seedNickname) => {
          const target = ip.trim()
          if (!target) return

          // Reuse an existing provider (retry) or mint a fresh one.
          let provider = providers.get(target)
          if (!provider) {
            provider = createControllerProvider(target)
            providers.set(target, provider)
            unsubscribers.set(
              target,
              provider.subscribe((status) => {
                const patch = phaseFromStatus(status)
                if (patch) patchController(target, patch)
              }),
            )
          }

          // Born pending + active the instant the add is submitted.
          set((s) => ({
            controllers: {
              ...s.controllers,
              [target]: {
                ip: target,
                phase: 'pending',
                mapDim: null,
                nickname: seedNickname || undefined,
              },
            },
          }))
          get().setActive(target)

          try {
            await provider.connect({ address: target })
          } catch (e) {
            // A declined per-IP permission grant (#229) is a user choice, not a
            // failure to dwell on: drop the half-created entry so the UI returns to
            // the pre-connect state and the next Connect re-prompts. Any other
            // failure leaves the entry, whose pill the status subscription has
            // already flipped to error.
            if (e instanceof ControllerPermissionDeniedError) await get().removeController(target)
            return
          }

          // Live: read the nickname + installed-map dimensionality, remember the IP.
          const [config, map] = await Promise.all([
            provider.getConfig().catch(() => null),
            provider.getPixelMap().catch(() => null),
          ])
          patchController(target, {
            phase: 'live',
            nickname: config?.name || undefined,
            mapDim: mapDimension(map),
          })
          // Remember the IP *and* the freshly-read name (#215). A device rename since
          // last session lands here, so the persisted nickname always reflects the
          // device's current name rather than a stale seed.
          set({ lastConnectedIp: target, lastConnectedNickname: config?.name || null })
          // Warm the panel store immediately so it opens populated rather than
          // empty-then-jumping as the first lazy poll lands (#225). The panel still
          // owns the polling interval (started on open); this is a one-shot seed.
          useControllerPanelStore.getState().seed()
        },

        removeController: async (ip) => {
          const provider = providers.get(ip)
          unsubscribers.get(ip)?.()
          unsubscribers.delete(ip)
          providers.delete(ip)
          await provider?.disconnect().catch(() => {})

          set((s) => {
            const controllers = { ...s.controllers }
            delete controllers[ip]
            const nextActive =
              s.activeIp === ip ? (Object.keys(controllers)[0] ?? null) : s.activeIp
            return {
              controllers,
              activeIp: nextActive,
              lastConnectedIp: s.lastConnectedIp === ip ? null : s.lastConnectedIp,
              lastConnectedNickname:
                s.lastConnectedIp === ip ? null : s.lastConnectedNickname,
            }
          })
          // Re-point the active provider at the new active Controller (or none).
          const { activeIp } = get()
          setControllerProvider(activeIp ? providers.get(activeIp)! : new NullControllerProvider())
        },

        autoConnect: async () => {
          const remembered = get().lastConnectedIp?.trim()
          if (!remembered) return
          await get().addController(remembered, get().lastConnectedNickname ?? undefined)
        },

        clearPushResult: () => set({ pushResult: null }),

        requestPush: async () => {
          const controllerId = get().activeIp
          const patternId = usePatternStore.getState().activePatternId
          const { previewSource, previewPixelCount } = useEditorStore.getState()
          // Mirror pushActivePattern's no-op guard: nothing active → nothing to do.
          if (!controllerId || !patternId || !previewSource) return

          // The Controller's configured pixel count is read fresh (best-effort) so the
          // reconciliation reflects the device as wired now; a read failure leaves it
          // unknown and the fit warnings are simply suppressed (engine handles null).
          const config = await getControllerProvider().getConfig().catch(() => null)
          const { warnings } = describePreflight({
            localPixelCount: previewPixelCount,
            devicePixelCount: config?.pixelCount ?? null,
            // Map upload isn't wired yet (H10/H11 push pattern bytecode only); the
            // device keeps its own map, so there's nothing to overwrite.
            pushingMap: false,
          })
          // Clean preflight → keep the one-click path. Any warning → open the dialog.
          if (warnings.length === 0) {
            await get().pushActivePattern()
            return
          }
          set({ preflight: warnings })
        },

        confirmPush: async () => {
          set({ preflight: null })
          await get().pushActivePattern()
        },

        cancelPush: () => set({ preflight: null, mapPushRemedyCount: null }),

        requestMapPush: async () => {
          const controllerId = get().activeIp
          const map = openMapForPush()
          if (!controllerId || !map) return

          // Fresh device count (best-effort) for the count-fit reconciliation; a read
          // failure leaves it unknown and only the overwrite warning shows.
          const config = await getControllerProvider().getConfig().catch(() => null)
          const devicePixelCount = config?.pixelCount ?? null
          // Reconcile against what we will *actually* send: the map re-baked to the
          // device count (#204), not the preview-baked array. A map whose source honours
          // its `pixelCount` argument conforms here and the counts match; a hard-coded
          // point count can't, leaving a mismatch the firmware would silently drop (#213).
          const points = resolveMapPushPoints(map.source, map.points, devicePixelCount)
          const { warnings, blocking, remedyPixelCount } = describePreflight({
            localPixelCount: points.length,
            devicePixelCount,
            // A map send always overwrites the device's single shared map, so the
            // overwrite warning always fires — the dialog always opens (a deliberate
            // act, never a silent one-click like a clean pattern push).
            pushingMap: true,
          })
          // A blocking mismatch arms the coupled remedy; otherwise the dialog offers the
          // plain "Send anyway" path.
          set({ preflight: warnings, mapPushRemedyCount: blocking ? remedyPixelCount : null })
        },

        confirmMapPush: async () => {
          const remedy = get().mapPushRemedyCount
          set({ preflight: null, mapPushRemedyCount: null })
          // Blocking mismatch: the map can't conform, so couple the push with a
          // setPixelCount that makes the device match the map's fixed point count. Order
          // matters — the firmware validates a saved map against the *current* pixelCount,
          // so the count must be set first. If that fails, abort rather than push a map
          // the firmware would silently drop (#213).
          if (remedy != null) {
            try {
              await getControllerProvider().setPixelCount(remedy)
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err)
              set({ pushResult: { ok: false, message } })
              return
            }
          }
          await get().pushActiveMap()
        },

        confirmMapPushOnly: async () => {
          set({ preflight: null, mapPushRemedyCount: null })
          await get().pushActiveMap()
        },

        confirmSetPixelCountOnly: async () => {
          const remedy = get().mapPushRemedyCount
          set({ preflight: null, mapPushRemedyCount: null })
          if (remedy == null) return
          // Set the count alone — no map write. Surfaces success/failure through the same
          // pushResult slice the button reads, so the check/Send-failed states still apply.
          set({ pushing: true, pushResult: null })
          try {
            // When this lowers the count (#222), the helper blacks out the strip
            // before shrinking so pixels beyond the new limit go dark — exactly as a
            // panel edit does. A reduction is judged against the live device count.
            const prev = useControllerPanelStore.getState().pixelCount
            await applyControllerPixelCount(getControllerProvider(), remedy, prev)
            set({ pushing: false, pushResult: { ok: true, created: false } })
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            set({ pushing: false, pushResult: { ok: false, message } })
          }
        },

        pushActiveMap: async () => {
          const controllerId = get().activeIp
          const map = openMapForPush()
          if (!controllerId || !map) return

          set({ pushing: true, pushResult: null })
          try {
            // Re-bake to the device's pixel count before sending (#204): the firmware
            // ignores a map whose entry count differs from its wired pixelCount, and the
            // baked `points` are sized to the preview, not the device.
            const config = await getControllerProvider().getConfig().catch(() => null)
            const points = resolveMapPushPoints(map.source, map.points, config?.pixelCount ?? null)
            await getControllerProvider().setPixelMap(points)
            set((s) => ({
              pushing: false,
              // A Controller has one map slot — a push always overwrites it in place,
              // so `created` is always false (unlike a pattern, which can mint a new id).
              pushResult: { ok: true, created: false },
              lastPushedMap: {
                ...s.lastPushedMap,
                [controllerId]: { ...s.lastPushedMap[controllerId], [map.id]: map.signature },
              },
            }))
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            set({ pushing: false, pushResult: { ok: false, message } })
          }
        },

        pushActivePattern: async () => {
          const controllerId = get().activeIp
          const patternId = usePatternStore.getState().activePatternId
          const { previewSource, previewPatternName } = useEditorStore.getState()
          // The button's gate already guarantees a connected Controller + a matching
          // active pattern, but guard anyway so a stray call is an inert no-op.
          if (!controllerId || !patternId || !previewSource) return

          set({ pushing: true, pushResult: null })
          try {
            // Push the bundled artifact (library-inlined) — the same code Copy/Download
            // emit — never raw editor source. Use the last *clean* preview source so a
            // broken edit is never compiled and pushed.
            const { code } = bundle(previewSource, LIBRARIES)
            const { created } = await pushPattern({
              provider: getControllerProvider(),
              controllerId,
              patternId,
              source: code,
              name: previewPatternName,
              loadBindings: getControllerBindings,
              saveBindings: setControllerBindings,
            })
            // Remember the clean source we just pushed so the dirty gate disables a
            // redundant re-push until the pattern is edited again.
            set((s) => ({
              pushing: false,
              pushResult: { ok: true, created },
              lastPushedSource: {
                ...s.lastPushedSource,
                [controllerId]: { ...s.lastPushedSource[controllerId], [patternId]: previewSource },
              },
            }))
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            set({ pushing: false, pushResult: { ok: false, message } })
          }
        },
      }
    },
    {
      name: 'pixelblaze-controller',
      partialize: (s) => ({
        lastConnectedIp: s.lastConnectedIp,
        lastConnectedNickname: s.lastConnectedNickname,
      }),
    },
  ),
)

/** Test-only: drop all live providers + subscriptions (no persistence touch). */
export function __resetControllerProviders(): void {
  unsubscribers.forEach((u) => u())
  unsubscribers.clear()
  providers.clear()
}
