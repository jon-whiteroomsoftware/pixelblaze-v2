import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { setControllerProviderFactory } from './engine/controllerProviderRegistry'
import { ExtensionControllerProvider } from './engine/ExtensionControllerProvider'
import { windowRelayTransport } from './engine/windowRelayTransport'

// Install how the keyed store mints a live backend per Controller IP (#210): each
// Controller gets its own extension-backed provider over a shared window relay
// transport, so connections are fully isolated. Until the extension is installed
// every provider stays no-extension, so the app behaves exactly as before — the
// header's entry affordance shows the install pitch. App.tsx drives startup
// extension detection + last-connected auto-reconnect from here.
const transport = windowRelayTransport()
setControllerProviderFactory(() => new ExtensionControllerProvider({ transport }))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
