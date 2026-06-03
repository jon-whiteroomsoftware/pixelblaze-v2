// The app's seam to live Controller backends (H4, issue #196; reshaped for the
// keyed multi-Controller model in #210). Two responsibilities live here, both
// behind the H2 seam so the UI never imports a concrete backend:
//
//  1. The *active* provider — the single connection the Controller panel and
//     Send-to-Controller read/drive. `getControllerProvider()` returns it; the
//     keyed store points it at whichever Controller is active.
//  2. A *factory* — how to mint a provider for a given Controller IP. The keyed
//     store creates one provider per connected Controller through this, so each
//     live connection is fully isolated (its own socket, reconnect, status
//     machine). Extension presence is global, so one shared `detect` serves all.
//
// Defaults to NullControllerProvider (permanently no-extension) so the UI renders
// against the seam before any extension exists. main.tsx installs the real
// factory + active provider; tests inject fakes.
//
// Pure TypeScript, zero React, zero transport specifics.

import { NullControllerProvider, type ControllerProvider } from './ControllerProvider'

let active: ControllerProvider = new NullControllerProvider()

export function getControllerProvider(): ControllerProvider {
  return active
}

/** Point the seam at the active Controller's provider (or a no-op Null one when
 *  nothing is active). Used by the keyed store on activation, and by tests. */
export function setControllerProvider(provider: ControllerProvider): void {
  active = provider
}

// ── per-Controller factory + global extension detection ──────────────────────

export type ControllerProviderFactory = (ip: string) => ControllerProvider

// Default factory: a no-op provider, so the store is inert until a real backend
// is installed. main.tsx swaps in one that mints transport-backed providers.
let factory: ControllerProviderFactory = () => new NullControllerProvider()

// A standalone provider used solely for the global extension handshake — minting
// it lazily lets `detectControllerExtension` work before any Controller is added.
let detector: ControllerProvider | null = null

/** Install how the keyed store mints a provider per Controller IP. */
export function setControllerProviderFactory(f: ControllerProviderFactory): void {
  factory = f
}

/** Mint a fresh provider for one Controller. */
export function createControllerProvider(ip: string): ControllerProvider {
  return factory(ip)
}

/** Probe whether the relay extension is installed/reachable — global, not tied to
 *  any one Controller. Reuses a single ambient provider for the handshake. */
export function detectControllerExtension(): Promise<boolean> {
  detector ??= factory('__detect__')
  return detector.detectHelper()
}

/** Reset to the default no-extension provider + factory (test teardown / reset). */
export function resetControllerProvider(): void {
  active = new NullControllerProvider()
  factory = () => new NullControllerProvider()
  detector = null
}
