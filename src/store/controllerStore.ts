import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  createControllerProvider,
  setControllerProvider,
  detectControllerExtension,
} from '@/engine/controllerProviderRegistry'
import { NullControllerProvider, type ControllerProvider, type ControllerStatus } from '@/engine/ControllerProvider'
import { mapDimension, type MapDimension } from '@/engine/sendToController'
import type { ControllerPhase } from '@/engine/controllerPillView'

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

  /** Probe extension presence and record it (global). */
  detectExtension: () => Promise<boolean>
  /** Begin connecting to `ip`: born as a pending pill, made active immediately.
   *  Settles to live (nickname + mapDim read) or error. Re-adding an existing IP
   *  retries it. Rejection is swallowed — the pill reflects the error. */
  addController: (ip: string) => Promise<void>
  /** Disconnect + drop a Controller. If it was active, activates another (or none).
   *  Clears the remembered last-connected IP if it was this one. */
  removeController: (ip: string) => Promise<void>
  /** Make `ip` the active Controller (points the registry's active provider at it). */
  setActive: (ip: string) => void
  /** Startup auto-reconnect: try only the remembered last-connected Controller. */
  autoConnect: () => Promise<void>
}

export const controllerInitialState = {
  extensionPresent: false,
  controllers: {} as Record<string, ControllerEntry>,
  activeIp: null as string | null,
  lastConnectedIp: null as string | null,
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

        setActive: (ip) => {
          set({ activeIp: ip })
          setControllerProvider(providers.get(ip) ?? new NullControllerProvider())
        },

        addController: async (ip) => {
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
              [target]: { ip: target, phase: 'pending', mapDim: null },
            },
          }))
          get().setActive(target)

          try {
            await provider.connect({ address: target })
          } catch {
            // The provider's status subscription already flips the pill to error.
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
          set({ lastConnectedIp: target })
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
            }
          })
          // Re-point the active provider at the new active Controller (or none).
          const { activeIp } = get()
          setControllerProvider(activeIp ? providers.get(activeIp)! : new NullControllerProvider())
        },

        autoConnect: async () => {
          const remembered = get().lastConnectedIp?.trim()
          if (!remembered) return
          await get().addController(remembered)
        },
      }
    },
    {
      name: 'pixelblaze-controller',
      partialize: (s) => ({ lastConnectedIp: s.lastConnectedIp }),
    },
  ),
)

/** Test-only: drop all live providers + subscriptions (no persistence touch). */
export function __resetControllerProviders(): void {
  unsubscribers.forEach((u) => u())
  unsubscribers.clear()
  providers.clear()
}
