// Generate Chrome Web Store + reusable promo assets for PXLBLZ-IDE.
//
//   raw captures (live IDE via Playwright, 2x) -> composed branded tiles
//   (HTML template rendered at exact store canvas sizes, JPEG = no alpha)
//   + store icon (96x96 artwork in 128x128, 16px transparent padding, PNG+alpha)
//   + small/marquee marketing tiles (wordmark + tagline)
//
// Run with the dev server up on 5174:  node scripts/promo/generate.mjs
import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'

const BASE = 'http://localhost:5174/PXLBLZ-IDE/'
const RAW = 'build/promo/raw'        // live captures (overwritten every run)
const INPUT = 'scripts/promo/input'  // hand-supplied frames (committed, never overwritten)
const OUT = 'build/promo'
mkdirSync(RAW, { recursive: true })
mkdirSync(INPUT, { recursive: true })
mkdirSync(OUT, { recursive: true })

// Resolve a frame for a slot: prefer a hand-supplied input/<slot>.{png,jpg} over
// the live capture in raw/. Lets you drop a better screenshot (e.g. a real
// connected-state shot) into scripts/promo/input/ without touching this script.
function frame(slot) {
  for (const ext of ['png', 'jpg', 'jpeg']) {
    const p = `${INPUT}/${slot}.${ext}`
    if (existsSync(p)) return { path: p, supplied: true }
  }
  return { path: `${RAW}/${slot}.png`, supplied: false }
}

// ── brand tokens (mirror src/index.css) ──────────────────────────────────────
const BG = '#141416'
const PANEL = '#18181b'
const FG = '#fafafa'
const MUTED = '#a1a1aa'
const AMBER = '#fbbf24'
const SEAM = '#2e2e34'

// IBM Plex Mono, embedded so the tiles render identically headless.
const font400 = readFileSync('extension/fonts/ibm-plex-mono-latin-400-normal.woff2').toString('base64')
const font600 = readFileSync('extension/fonts/ibm-plex-mono-latin-600-normal.woff2').toString('base64')
const FONT_CSS = `
@font-face{font-family:'IBM Plex Mono';font-weight:400;font-style:normal;font-display:block;src:url(data:font/woff2;base64,${font400}) format('woff2');}
@font-face{font-family:'IBM Plex Mono';font-weight:600;font-style:normal;font-display:block;src:url(data:font/woff2;base64,${font600}) format('woff2');}
`

// The amber-wave brand glyph (from extension/icon.svg), as an inline SVG string.
const wave = (px) => `
<svg width="${px}" height="${px}" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M14 64 Q30.7 26.5 47.3 64 T80.7 64 T114 64" fill="none" stroke="${AMBER}" stroke-width="10" stroke-linecap="round"/>
  <circle cx="114" cy="64" r="9" fill="${AMBER}"/>
</svg>`

const dataUri = (path) => `data:image/png;base64,${readFileSync(path).toString('base64')}`

// ── 1. raw captures from the live IDE ────────────────────────────────────────
// Any slot with a hand-supplied frame in scripts/promo/input/ is skipped here.
async function capture() {
  const need = (slot) => !frame(slot).supplied
  if (!['b-edit', 'c-preview', 'd-editor', 'a-connect'].some(need)) {
    console.log('  (all frames supplied; skipping live capture)')
    return
  }
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  await page.goto(BASE)
  await page.locator('#root').waitFor()
  await page.locator('[data-testid="preview-pane"] canvas').first().waitFor()
  await page.waitForTimeout(700)

  const preview = page.locator('[data-testid="preview-pane"]')

  // B — browser editing: a colorful 2D demo, editor + preview side by side.
  if (need('b-edit')) {
    await page.getByText('Kishimisu', { exact: true }).click()
    await page.waitForTimeout(900)
    await page.screenshot({ path: `${RAW}/b-edit.png`, clip: { x: 230, y: 28, width: 1210, height: 872 } })
  }

  // C — preview eye-candy: the 3D sphere render, preview pane only.
  if (need('c-preview')) {
    await page.getByText('NebulaSphere', { exact: true }).click()
    await page.waitForTimeout(1200)
    await preview.screenshot({ path: `${RAW}/c-preview.png` })
  }

  // A (connect): if no frame is supplied, shot 1 falls back to a faithful HTML
  // card (see connectShotHTML) — the live popover isn't cleanly clippable and the
  // ideal connected-state hero needs real hardware (the #257 pass). Drop a real
  // connected-state screenshot at scripts/promo/input/a-connect.png to use it.

  // D — editor intelligence: autocomplete popup in an editable pattern.
  if (need('d-editor')) {
    await page.getByRole('button', { name: 'New pattern', exact: true }).click()
    await page.waitForTimeout(500)
    const mono = page.locator('.monaco-editor').first()
    await mono.click()
    await page.keyboard.press('Control+End')
    await page.keyboard.type('\n  h')
    await page.keyboard.press('Control+Space')
    await page.waitForTimeout(900)
    // clip a tidy region of the editor showing code + the suggest widget
    await page.screenshot({ path: `${RAW}/d-editor.png`, clip: { x: 230, y: 28, width: 760, height: 560 } })
  }

  await browser.close()
}

// ── 2. composed screenshot tiles (1280x800, JPEG) ────────────────────────────
async function shootHTML(page, html, { width, height, path, type = 'jpeg', omitBackground = false }) {
  await page.setViewportSize({ width, height })
  await page.setContent(html, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(150)
  await page.screenshot({ path, type, ...(type === 'jpeg' ? { quality: 92 } : {}), omitBackground })
}

function chrome(caption, imgPath) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  ${FONT_CSS}
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:1280px;height:800px;font-family:'IBM Plex Mono',ui-monospace,monospace;
    background:radial-gradient(120% 100% at 50% -10%, #1c1c20 0%, ${BG} 60%);color:${FG};overflow:hidden}
  .wrap{padding:54px 64px;height:100%;display:flex;flex-direction:column}
  .top{display:flex;align-items:center;gap:12px;margin-bottom:22px}
  .wordmark{font-weight:600;letter-spacing:.18em;font-size:20px;color:${FG}}
  h1{font-weight:600;font-size:34px;line-height:1.25;letter-spacing:-.01em;max-width:1000px;margin-bottom:30px}
  h1 .amber{color:${AMBER}}
  .frame{flex:1;border:1px solid ${SEAM};border-radius:14px;overflow:hidden;
    box-shadow:0 24px 60px rgba(0,0,0,.55);background:${PANEL};position:relative}
  .frame img{width:100%;height:100%;object-fit:cover;object-position:top left;display:block}
  </style></head><body><div class="wrap">
    <div class="top">${wave(26)}<span class="wordmark">PXLBLZ&#8209;IDE</span></div>
    <h1>${caption}</h1>
    <div class="frame"><img src="${dataUri(imgPath)}"/></div>
  </div></body></html>`
}

// Shot A — connect: a faithful render of the controller-connect card, framed on
// the brand canvas with a mock nav "Connect" pill so the affordance reads clearly.
function connectShotHTML(caption) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  ${FONT_CSS}
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:1280px;height:800px;font-family:'IBM Plex Mono',ui-monospace,monospace;
    background:radial-gradient(120% 100% at 50% -10%, #1c1c20 0%, ${BG} 60%);color:${FG};overflow:hidden}
  .wrap{padding:54px 64px;height:100%;display:flex;flex-direction:column}
  .top{display:flex;align-items:center;gap:12px;margin-bottom:22px}
  .wordmark{font-weight:600;letter-spacing:.18em;font-size:20px}
  h1{font-weight:600;font-size:34px;line-height:1.25;letter-spacing:-.01em;margin-bottom:30px}
  h1 .amber{color:${AMBER}}
  .frame{flex:1;border:1px solid ${SEAM};border-radius:14px;background:${PANEL};
    box-shadow:0 24px 60px rgba(0,0,0,.55);position:relative;overflow:hidden}
  .navbar{height:52px;border-bottom:1px solid ${SEAM};display:flex;align-items:center;justify-content:flex-end;padding:0 18px}
  .pill{display:flex;align-items:center;gap:8px;border:1px solid ${SEAM};border-radius:8px;padding:7px 12px;font-size:14px;color:${FG}}
  .dot{width:9px;height:9px;border-radius:50%;background:${AMBER};box-shadow:0 0 8px ${AMBER}}
  .stage{position:absolute;inset:52px 0 0 0;display:flex;align-items:center;justify-content:center}
  .card{width:360px;background:#1c1c20;border:1px solid ${SEAM};border-radius:12px;padding:20px;display:flex;flex-direction:column;gap:10px;box-shadow:0 18px 50px rgba(0,0,0,.5)}
  .card h2{font-size:17px;font-weight:600}
  .card p{font-size:14px;line-height:1.5;color:${MUTED}}
  .card button{align-self:flex-start;margin-top:4px;font:inherit;font-size:14px;color:${FG};background:transparent;border:1px solid ${SEAM};border-radius:7px;padding:8px 14px;cursor:pointer}
  </style></head><body><div class="wrap">
    <div class="top">${wave(26)}<span class="wordmark">PXLBLZ&#8209;IDE</span></div>
    <h1>${caption}</h1>
    <div class="frame">
      <div class="navbar"><span class="pill"><span class="dot"></span>Connect</span></div>
      <div class="stage"><div class="card">
        <h2>Install the Pixelblaze extension</h2>
        <p>Connecting to a Controller on your LAN needs the companion browser extension. Install it, then follow the setup steps to grant it access to your Pixelblaze.</p>
        <button>I&rsquo;ve installed it</button>
      </div></div>
    </div>
  </div></body></html>`
}

// Shot A — connect, with a real (portrait) panel screenshot: side-by-side hero,
// headline left, the panel image right at natural aspect (no wide-crop).
function panelShotHTML(caption, imgPath) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  ${FONT_CSS}
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:1280px;height:800px;font-family:'IBM Plex Mono',ui-monospace,monospace;
    background:radial-gradient(120% 100% at 50% -10%, #1c1c20 0%, ${BG} 60%);color:${FG};overflow:hidden}
  .wrap{padding:54px 64px;height:100%;display:flex;flex-direction:column}
  .top{display:flex;align-items:center;gap:12px;margin-bottom:8px}
  .wordmark{font-weight:600;letter-spacing:.18em;font-size:20px}
  .main{flex:1;display:flex;align-items:center;gap:56px}
  .col{flex:1;display:flex;flex-direction:column;gap:18px}
  h1{font-weight:600;font-size:40px;line-height:1.2;letter-spacing:-.01em}
  h1 .amber{color:${AMBER}}
  .sub{color:${MUTED};font-size:17px;line-height:1.6}
  .shot{height:600px;display:flex;align-items:center;justify-content:center}
  .shot img{max-height:600px;max-width:520px;
    filter:drop-shadow(0 24px 60px rgba(0,0,0,.55))}
  </style></head><body><div class="wrap">
    <div class="top">${wave(26)}<span class="wordmark">PXLBLZ&#8209;IDE</span></div>
    <div class="main">
      <div class="col">
        <h1>${caption}</h1>
        <div class="sub">Connect over your local network for live controls, brightness, FPS and pixel-map read-back &mdash; straight from the browser.</div>
      </div>
      <div class="shot"><img src="${dataUri(imgPath)}"/></div>
    </div>
  </div></body></html>`
}

// ── 3. store icon (128x128, 96 artwork, 16px transparent pad, PNG+alpha) ──────
function iconHTML() {
  // 96x96 rounded tile centered in 128 canvas; subtle white outer glow for dark
  // backgrounds; no hard keyline; small inner shadow only.
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0}html,body{width:128px;height:128px;background:transparent}
  .canvas{width:128px;height:128px;display:flex;align-items:center;justify-content:center}
  .tile{width:96px;height:96px;border-radius:20px;background:${PANEL};
    display:flex;align-items:center;justify-content:center;
    box-shadow:0 0 0 1px rgba(255,255,255,.06), 0 0 10px rgba(255,255,255,.10);}
  </style></head><body><div class="canvas"><div class="tile">${wave(72)}</div></div></body></html>`
}

// ── 4. marketing tiles (brand + tagline) ─────────────────────────────────────
const TAGLINE = 'A modern IDE for Pixelblaze'
function brandTile(width, height, { big }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  ${FONT_CSS}
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:${width}px;height:${height}px;font-family:'IBM Plex Mono',ui-monospace,monospace;
    background:radial-gradient(130% 120% at 18% 0%, #20201a 0%, ${BG} 55%);color:${FG};overflow:hidden}
  .wrap{height:100%;display:flex;flex-direction:column;justify-content:center;padding:0 ${big ? 90 : 34}px;gap:${big ? 22 : 12}px}
  .brand{display:flex;align-items:center;gap:${big ? 18 : 10}px}
  .wordmark{font-weight:600;letter-spacing:.16em;font-size:${big ? 56 : 26}px}
  .tag{color:${MUTED};font-size:${big ? 26 : 14}px;letter-spacing:.02em}
  .rule{height:2px;width:${big ? 120 : 54}px;background:${AMBER};border-radius:2px;margin-top:${big ? 6 : 3}px}
  </style></head><body><div class="wrap">
    <div class="brand">${wave(big ? 64 : 30)}<span class="wordmark">PXLBLZ&#8209;IDE</span></div>
    <div class="rule"></div>
    <div class="tag">${TAGLINE}</div>
  </div></body></html>`
}

// ── run ──────────────────────────────────────────────────────────────────────
console.log('capturing live IDE…')
await capture()

console.log('composing tiles…')
const browser = await chromium.launch()
const page = await browser.newPage({ deviceScaleFactor: 1 })

// All four listing shots. Edit captions here (one place). `slot` selects the
// frame: a hand-supplied scripts/promo/input/<slot>.{png,jpg} wins over the live
// capture. Shot 1 with no supplied frame falls back to the rendered connect card.
const SHOTS = [
  { slot: 'a-connect', cap: 'Push patterns and maps to your <span class="amber">Pixelblaze</span>', out: 'screenshot-1-connect-1280x800.jpg' },
  { slot: 'c-preview', cap: 'Live 1D / 2D / 3D preview for patterns and maps', out: 'screenshot-2-preview-1280x800.jpg' },
  { slot: 'b-edit', cap: 'Editing, libraries, preview and <span class="amber">Pixelblaze</span> access &mdash; all in one place', out: 'screenshot-3-edit-1280x800.jpg' },
  { slot: 'd-editor', cap: 'Shared library code, tree-shaken into one <span class="amber">controller-ready</span> file', out: 'screenshot-4-editor-1280x800.jpg' },
]
for (const s of SHOTS) {
  const f = frame(s.slot)
  let html
  if (s.slot === 'a-connect') {
    html = f.supplied ? panelShotHTML(s.cap, f.path) : connectShotHTML(s.cap)
  } else {
    html = chrome(s.cap, f.path)
  }
  await shootHTML(page, html, { width: 1280, height: 800, path: `${OUT}/${s.out}` })
  console.log('  ', s.out, f.supplied ? '(supplied frame)' : '')
}

await shootHTML(page, iconHTML(), { width: 128, height: 128, path: `${OUT}/store-icon-128x128.png`, type: 'png', omitBackground: true })
console.log('   store-icon-128x128.png')
await shootHTML(page, brandTile(440, 280, { big: false }), { width: 440, height: 280, path: `${OUT}/small-promo-440x280.jpg` })
console.log('   small-promo-440x280.jpg')
await shootHTML(page, brandTile(1400, 560, { big: true }), { width: 1400, height: 560, path: `${OUT}/marquee-1400x560.jpg` })
console.log('   marquee-1400x560.jpg')

await browser.close()
console.log('\ndone ->', OUT)
