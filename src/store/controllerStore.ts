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
import { recommendedMapRemedy, type RecommendedMapRemedy } from '@/engine/patternMapRemedy'
import { resolveMapPushPoints } from '@/engine/mapPush'
import { stockMapSpec } from '@/engine/maps/stockCatalogue'
import { applyControllerPixelCount } from '@/engine/applyControllerPixelCount'
import type { ControllerPhase } from '@/engine/controllerPillView'
import { pushPattern } from '@/engine/pushPattern'
import {
  getControllerBindings,
  setControllerBindings,
  getProgramLabels,
  setProgramLabels,
} from '@/engine/storage'
import { withProgramLabel } from '@/engine/controllerBinding'
import { bundle } from '@/engine/bundle'
import { buildPreviewJpeg } from '@/engine/previewThumbnailJpeg'
import { LIBRARIES } from '@/pixelblaze/libs'
import { usePatternStore, activePushKey } from '@/store/patternStore'
import { useEditorStore } from '@/store/editorStore'
import { useMapStore, openMapForPushState } from '@/store/mapStore'
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
  /** Non-null while Chrome is waiting for the helper popup's per-IP grant (#235). */
  authorizationNeededIp?: string | null
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
  /** The pattern source last successfully *saved* (persist mode, #238), keyed
   *  controllerId → patternId. The save-mode analogue of `lastPushedSource`: run and
   *  save are distinct acts, so the dirty gate compares against this when Save is
   *  armed. Not persisted, same as the run record. */
  lastSavedSource: Record<string, Record<string, string>>
  /** Whether the Send button's Save mode is armed (#238). When on, Send persists the
   *  pattern to the device's Saved Patterns (#236) instead of a run-only push. Sticky:
   *  persisted across sessions (it's a deliberate, remembered intent). */
  saveArmed: boolean
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
  /** The recommended-map remedy offered alongside a pattern-push dim-mismatch warning
   *  (Option A): a demo whose recommended map (of the matching dimension) can be installed
   *  on the Controller so the device map's dim matches the pattern's. Non-null only while a
   *  pattern preflight is open AND the open demo carries such a recommendation; null for
   *  user patterns and demos without one (the dialog then offers a plain "Send anyway"). */
  patternMapRemedy: RecommendedMapRemedy | null

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
  /** Push the active pattern to the active Controller. A pattern push has no preflight
   *  (#239) — it sends bytecode only and the device runs it on its own pixels + map —
   *  so this pushes straight through (the one-click path). */
  requestPush: () => Promise<void>
  /** Acknowledge the pattern preflight dialog and push the pattern WITHOUT the coupled
   *  map install — the plain "Send anyway" path (the dim warning is soft). */
  confirmPatternPush: () => Promise<void>
  /** Acknowledge the pattern preflight and FIRST install the demo's recommended map (set
   *  the Controller's pixel count to the recommended count, then write the stock map),
   *  then push the pattern. The coupled remedy offered by the dim-mismatch checkbox
   *  (Option A). Order matters — count before map, then pattern — mirroring confirmMapPush.
   *  If the map install fails, the pattern is not pushed (surfaced as a Send-failed). */
  confirmPatternPushWithMap: () => Promise<void>
  /** Dismiss the (pattern- or map-push) preflight dialog without pushing. */
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
  /** Arm/disarm Save mode (#238). Sticky across sessions. */
  setSaveArmed: (armed: boolean) => void
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
  lastSavedSource: {} as Record<string, Record<string, string>>,
  saveArmed: false,
  lastPushedMap: {} as Record<string, Record<string, string>>,
  preflight: null as PreflightWarning[] | null,
  mapPushRemedyCount: null as number | null,
  patternMapRemedy: null as RecommendedMapRemedy | null,
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
      return {
        phase: 'pending',
        error: undefined,
        authorizationNeededIp: status.authorizationNeededIp ?? null,
      }
    case 'connected':
      return {
        phase: 'live',
        error: undefined,
        authorizationNeededIp: null,
        ...(status.controller.name ? { nickname: status.controller.name } : {}),
      }
    case 'error':
      return { phase: 'error', error: status.message, authorizationNeededIp: null }
    default:
      // extension-present / no-extension aren't entry states; ignore.
      return null
  }
}

// Install a stock map by id — the coupled remedy behind the pattern dim-mismatch checkbox
// (Option A). Mirrors pushActiveMap: re-bake the stock source to the DEVICE's current pixel
// count (the firmware stores exactly pixelCount entries, and the hardware count — not any
// preview size — is what the map must match) and write it. The hardware count is left
// untouched. Throws on an unknown id, an unreadable device count, or any transport failure
// so the caller can surface it.
async function installStockMap(remedy: RecommendedMapRemedy): Promise<void> {
  const spec = stockMapSpec(remedy.mapId)
  if (!spec) throw new Error(`Unknown map: ${remedy.mapId}`)
  const provider = getControllerProvider()
  const config = await provider.getConfig().catch(() => null)
  const points = resolveMapPushPoints(spec.source, [], config?.pixelCount ?? null)
  if (points.length === 0) {
    throw new Error("Couldn't read the Controller's pixel count to size the map")
  }
  await provider.setPixelMap(points)
}

export const useControllerStore = create<ControllerConnectionState>()(
  persist(
    (set, get) => {
      // Resolve the map currently open in the editor's map mode into the bits a push
      // needs: its stable id, baked coordinate array, and a change signature (its
      // source) for the dirty gate. Works for both custom maps and read-only stock maps.
      const openMapForPush = ():
        | { id: string; points: number[][]; source: string | undefined; signature: string }
        | null => {
        return openMapForPushState(useMapStore.getState())
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

          // Reconnecting to the controller we last connected to? Seed the pending pill
          // from the cached name so it never flashes the bare IP before getConfig lands
          // (#230). The live read below still overwrites it if the device was renamed.
          const seed =
            seedNickname ??
            (target === get().lastConnectedIp ? get().lastConnectedNickname ?? undefined : undefined)

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
                nickname: seed || undefined,
                authorizationNeededIp: null,
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
            // Sticky name: only overwrite when getConfig actually returned one. During
            // the reconnect churn (#230) getConfig can land on a torn-down socket and
            // reject (→ null here); clobbering the name to undefined would flash the
            // pill back to the bare IP. Keep the seeded/last-known name instead.
            ...(config?.name ? { nickname: config.name } : {}),
            mapDim: mapDimension(map),
          })
          // Remember the IP *and* the freshly-read name (#215). A device rename since
          // last session lands here, so the persisted nickname reflects the device's
          // current name. Only overwrite the remembered name when we actually read one
          // — a transient getConfig failure must not poison the seed for next reload.
          set({
            lastConnectedIp: target,
            ...(config?.name ? { lastConnectedNickname: config.name } : {}),
          })
          // Warm the panel store immediately so it opens populated rather than
          // empty-then-jumping as the first lazy poll lands (#225). The panel still
          // owns the polling interval (started on open); this is a one-shot seed.
          useControllerPanelStore.getState().seed(target)
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

        setSaveArmed: (armed) => set({ saveArmed: armed }),

        clearPushResult: () => set({ pushResult: null }),

        requestPush: async () => {
          // A pattern push has no *count* preflight (#239) — it sends bytecode only and
          // the device runs it on its own pixels + map. The one concern is the dim match:
          // a pattern whose dimensionality differs from the installed map renders against
          // coordinates that don't line up. That's a soft warning, so reconcile and, only
          // when it fires, open the popover; otherwise push straight through (the valued
          // one-click path). The guard inside pushActivePattern makes a stray call inert.
          const activeIp = get().activeIp
          const active = activeIp ? get().controllers[activeIp] : undefined
          const patternDim = useEditorStore.getState().nativeDim
          const { warnings } = describePreflight({
            pushingMap: false,
            patternDim,
            mapDim: active?.mapDim ?? null,
          })
          if (warnings.length > 0) {
            // A dim mismatch is never blocking. It may carry a coupled remedy (Option A):
            // a demo whose recommended map (of the matching dim) can be installed to fix
            // the mismatch. Absent for user patterns and demos without a recommendation.
            const demoName = usePatternStore.getState().activeDemoName
            set({
              preflight: warnings,
              mapPushRemedyCount: null,
              patternMapRemedy: recommendedMapRemedy(demoName, patternDim),
            })
            return
          }
          await get().pushActivePattern()
        },

        confirmPatternPush: async () => {
          set({ preflight: null, mapPushRemedyCount: null, patternMapRemedy: null })
          await get().pushActivePattern()
        },

        confirmPatternPushWithMap: async () => {
          const remedy = get().patternMapRemedy
          const controllerId = get().activeIp
          set({ preflight: null, mapPushRemedyCount: null, patternMapRemedy: null })
          // No remedy to apply (shouldn't happen via the checkbox) — plain push.
          if (!remedy) {
            await get().pushActivePattern()
            return
          }
          // Install the recommended map first (count, then map). A failure aborts before
          // the pattern push — surfaced through the same pushResult the button reads.
          set({ pushing: true, pushResult: null })
          try {
            await installStockMap(remedy)
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            set({ pushing: false, pushResult: { ok: false, message } })
            return
          }
          // Reflect the now-installed map's dimensionality so the warning doesn't recur on
          // the next push of this (or another matching-dim) pattern.
          if (controllerId) {
            set((s) => {
              const entry = s.controllers[controllerId]
              return entry
                ? { controllers: { ...s.controllers, [controllerId]: { ...entry, mapDim: remedy.mapDim } } }
                : {}
            })
          }
          await get().pushActivePattern()
        },

        cancelPush: () =>
          set({ preflight: null, mapPushRemedyCount: null, patternMapRemedy: null }),

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
          // Any pushable pattern — a user pattern by id, a demo by its `demo:` key — so
          // demos push without forking (#208 follow-up). null only for a library/nothing.
          const patternId = activePushKey(usePatternStore.getState())
          const { previewSource, previewPatternName } = useEditorStore.getState()
          // The button's gate already guarantees a connected Controller + a matching
          // active pattern, but guard anyway so a stray call is an inert no-op.
          if (!controllerId || !patternId || !previewSource) return

          // The armed mode (#238): Save on persists a PBP record (#236); off is a
          // run-only push. Captured up front so the post-push dirty-gate record lands
          // in the matching map (run vs save are tracked separately).
          const persist = get().saveArmed

          set({ pushing: true, pushResult: null })
          try {
            // Push the bundled artifact (library-inlined) — the same code Copy/Download
            // emit — never raw editor source. Use the last *clean* preview source so a
            // broken edit is never compiled and pushed.
            const bundled = bundle(previewSource, LIBRARIES)
            const { code } = bundled
            // Save mode only: render the device-matched 100x150 waterfall preview and
            // embed it in the PBP blob (#259). A run-only push never persists a record,
            // so it needs no preview. A null result (render/encode failure) falls back to
            // the empty preview section rather than blocking the save.
            const previewImage = persist
              ? (await buildPreviewJpeg(bundled)) ?? undefined
              : undefined
            const { created, programId } = await pushPattern({
              provider: getControllerProvider(),
              controllerId,
              patternId,
              source: code,
              name: previewPatternName,
              persist,
              previewImage,
              loadBindings: getControllerBindings,
              saveBindings: setControllerBindings,
            })
            // Record the name we pushed against the device program id (#237) so the
            // panel resolves a run-only program — which never enters the device's
            // program list — to the pattern's name instead of the raw generated id.
            // Persist the cache and mirror it into the panel store for immediate display.
            if (previewPatternName) {
              const labels = withProgramLabel(
                await getProgramLabels(),
                controllerId,
                programId,
                previewPatternName,
              )
              await setProgramLabels(labels)
              useControllerPanelStore.getState().noteProgramLabel(programId, previewPatternName)
            }
            // Save-and-run (#238): the saved program is now on the device and active, but
            // the panel's `programs` list was last fetched on seed and so is stale —
            // refresh it so the freshly-saved id resolves via the list tier and the
            // `unsaved` marker clears. Run-only pushes never enter the list, so skip.
            if (persist) {
              void useControllerPanelStore.getState().refreshPrograms()
            }
            // Remember the clean source we just pushed so the dirty gate disables a
            // redundant re-push until the pattern is edited again — into the run or save
            // record per the armed mode (#238), so flipping the toggle re-enables Send.
            const recordKey = persist ? 'lastSavedSource' : 'lastPushedSource'
            set((s) => ({
              pushing: false,
              pushResult: { ok: true, created },
              [recordKey]: {
                ...s[recordKey],
                [controllerId]: { ...s[recordKey][controllerId], [patternId]: previewSource },
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
        saveArmed: s.saveArmed,
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
