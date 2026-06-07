// Perf-harness runner — measures native Pixelblaze built-in costs on real
// hardware (#245). HUMAN-IN-THE-LOOP, OUT-OF-BAND: needs a physical Pixelblaze
// on the LAN with profiler.js hand-loaded and active. Excluded from the
// pre-commit gate (it touches the network).
//
//   PIXELBLAZE_IP=192.168.1.50 PIXELBLAZE_FW=3.67 npm run profile
//
// Strategy (mirrors test/divergence-harness/harness.ts):
//   1. connect, confirm profiler.js is loaded (ms/acc vars present)
//   2. auto-tune `iters` against the baseline op so a frame sits ~TARGET_MS,
//      CPU-bound and safely under the firmware watchdog
//   3. for each op: setVars, settle until the EMA converges, read ms
//   4. net cost = ms(op) - ms(baseline), per iter; normalize to a multiply
//   5. write the committed cost table to costs.md

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import WebSocket from 'ws'
import {
  PixelblazeConnection,
  type WebSocketLike,
} from '../../src/engine/PixelblazeConnection'

const HERE = dirname(fileURLToPath(import.meta.url))
const IP = process.env.PIXELBLAZE_IP ?? '192.168.1.50'
const FW = process.env.PIXELBLAZE_FW ?? 'unknown (set PIXELBLAZE_FW)'

// Keep a frame near this long: CPU-bound (so `delta` reflects work, not the FPS
// idle target) but well under the firmware watchdog. ~40ms ≈ 25fps.
const TARGET_MS = 40
// EMA in profiler.js has ~20-frame memory; settle several memory-lengths so the
// reading reflects the new op, not the previous one.
const SETTLE_MS = 1800
// Auto-tune ceiling so a pathological op can't push a frame into the watchdog.
const MAX_ITERS = 20000
const MIN_ITERS = 20

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** fn codes MUST match the `op` dispatch in profiler.js. */
interface Op {
  fn: number
  name: string
  group: string
}
const OPS: Op[] = [
  { fn: 0, name: 'baseline (identity)', group: 'baseline' },
  { fn: 1, name: 'mul', group: 'arithmetic' },
  { fn: 2, name: 'add', group: 'arithmetic' },
  { fn: 3, name: 'sub', group: 'arithmetic' },
  { fn: 4, name: 'div', group: 'arithmetic' },
  { fn: 5, name: 'mod (%)', group: 'arithmetic' },
  { fn: 6, name: 'abs', group: 'rounding' },
  { fn: 7, name: 'floor', group: 'rounding' },
  { fn: 8, name: 'ceil', group: 'rounding' },
  { fn: 9, name: 'frac', group: 'rounding' },
  { fn: 10, name: 'sin', group: 'trig' },
  { fn: 11, name: 'cos', group: 'trig' },
  { fn: 12, name: 'tan', group: 'trig' },
  { fn: 13, name: 'wave', group: 'waveform' },
  { fn: 14, name: 'triangle', group: 'waveform' },
  { fn: 15, name: 'square', group: 'waveform' },
  { fn: 16, name: 'sqrt', group: 'transcendental' },
  { fn: 17, name: 'pow', group: 'transcendental' },
  { fn: 18, name: 'exp', group: 'transcendental' },
  { fn: 19, name: 'log', group: 'transcendental' },
  { fn: 20, name: 'hypot', group: 'transcendental' },
  { fn: 21, name: 'atan2', group: 'inverse-trig' },
  { fn: 22, name: 'atan', group: 'inverse-trig' },
  { fn: 23, name: 'asin', group: 'inverse-trig' },
  { fn: 24, name: 'acos', group: 'inverse-trig' },
  { fn: 25, name: 'clamp', group: 'utility' },
  { fn: 26, name: 'min', group: 'utility' },
  { fn: 27, name: 'max', group: 'utility' },
  { fn: 28, name: 'perlin', group: 'noise' },
  { fn: 29, name: 'perlinTurbulence', group: 'noise' },
  { fn: 30, name: 'perlinRidge', group: 'noise' },
]

/** Node `ws` adapter satisfying the engine's WebSocketLike interface. */
function nodeFactory(url: string): WebSocketLike {
  return new WebSocket(url) as unknown as WebSocketLike
}

/** Select an op + loop count, let the EMA settle, read the averaged frame ms. */
async function measure(
  conn: PixelblazeConnection,
  fn: number,
  iters: number,
): Promise<number> {
  conn.setVars({ fn, iters })
  await sleep(SETTLE_MS)
  const vars = await conn.getVars()
  return vars.ms
}

/**
 * Find an `iters` for the baseline loop that lands a frame near TARGET_MS.
 * Starts small (watchdog-safe) and scales by the measured ratio, clamped.
 */
async function autoTuneIters(conn: PixelblazeConnection): Promise<number> {
  let iters = 200
  for (let attempt = 0; attempt < 5; attempt++) {
    const ms = await measure(conn, 0, iters)
    process.stdout.write(
      `  auto-tune: iters=${iters} → frame=${ms.toFixed(2)}ms\n`,
    )
    if (ms >= TARGET_MS * 0.8 && ms <= TARGET_MS * 1.5) break
    const scale = Math.max(0.2, Math.min(8, TARGET_MS / Math.max(ms, 0.5)))
    iters = Math.round(iters * scale)
    iters = Math.max(MIN_ITERS, Math.min(MAX_ITERS, iters))
  }
  return iters
}

interface Result {
  op: Op
  frameMs: number
  netMs: number // ms(op) - ms(baseline)
  perIterUs: number // net per single op call, microseconds
  relMul: number // cost relative to one multiply
}

function fmt(n: number): string {
  return Number.isFinite(n) ? n.toFixed(3) : String(n)
}

function buildReport(
  results: Result[],
  baselineMs: number,
  iters: number,
  mulPerIterUs: number,
): string {
  const now = new Date().toISOString().slice(0, 10)
  const lines: string[] = []
  lines.push('# Native built-in cost table — Pixelblaze hardware')
  lines.push('')
  lines.push(`**Generated:** ${now}  `)
  lines.push(`**Device:** \`${IP}\`  `)
  lines.push(`**Firmware:** ${FW}  `)
  lines.push(`**Inner-loop count (iters):** ${iters}  `)
  lines.push(`**Baseline frame (identity loop):** ${fmt(baselineMs)} ms  `)
  lines.push(
    `**Normalization unit:** one multiply = ${fmt(mulPerIterUs)} µs (≡ 1.0×)`,
  )
  lines.push('')
  lines.push(
    'Produced by `npm run profile` (test/perf-harness). The profiler pattern is ' +
      'hand-loaded via the ElectroMage editor; the runner drives it over the ' +
      'documented getVars/setVars API. Costs are **relative to a multiply** and ' +
      'measured in `beforeRender` (isolated from the per-pixel LED-output path), ' +
      'so they answer "is `wave` cheaper than `sin`, and by how much" — the one ' +
      'question the float64 emulator cannot answer.',
  )
  lines.push('')
  lines.push('| built-in | group | net µs/call | relative to mul |')
  lines.push('|---|---|---|---|')
  for (const r of results) {
    if (r.op.fn === 0) continue // baseline is the subtracted reference, not a row
    lines.push(
      `| \`${r.op.name}\` | ${r.op.group} | ${fmt(r.perIterUs)} | ${r.relMul.toFixed(1)}× |`,
    )
  }
  lines.push('')
  lines.push('## Method & caveats')
  lines.push('')
  lines.push(
    '- **Net cost** = `ms(op) − ms(baseline)`, divided by `iters`. Dispatch is ' +
      'hoisted out of the inner loop (one tight per-op loop, selected once per ' +
      'frame), so the baseline is the identical loop + `frac` wrap with an ' +
      'identity op and loop/frame overhead cancels exactly.',
  )
  lines.push(
    '- **Relative** numbers (×multiply) are robust to per-frame fixed cost and to ' +
      'the exact `iters`/firmware FPS target; prefer them over absolute µs.',
  )
  lines.push(
    '- Operands are wrapped to `[0,1)` each iteration, so 16.16 overflow does not ' +
      'change costs frame to frame. Ops with limited domains (`sqrt`, `log`, ' +
      '`asin`, `acos`) get a small offset/clamp — see profiler.js.',
  )
  lines.push(
    '- A near-zero or negative net (within noise) means the op is ' +
      'indistinguishable from a multiply on this firmware.',
  )
  lines.push(
    '- `wave` measures ~`sin`, not a cheap table lookup: on this firmware ' +
      '`wave()` *is* a sinusoid. The genuinely cheap periodics are ' +
      '`triangle`/`square`.',
  )
  lines.push(
    '- Each op is profiled with one fixed argument set (see `op` in ' +
      'profiler.js); cost can vary with operands. Notably `perlinTurbulence` ' +
      'here measures below `perlin` — likely an artifact of the octave/' +
      'lacunarity args, not a true per-call ordering. Treat the noise family as ' +
      'indicative, not exact.',
  )
  lines.push('')
  return lines.join('\n')
}

async function main(): Promise<void> {
  console.log(`Connecting to Pixelblaze at ws://${IP}:81 …`)
  const conn = new PixelblazeConnection({
    host: IP,
    webSocketFactory: nodeFactory,
    requestTimeoutMs: 4000,
  })
  conn.on('error', (e) => console.error('socket error:', e))
  await conn.connect()
  console.log('Connected. Confirming profiler.js is loaded …')

  const initial = await conn.getVars()
  if (!('ms' in initial) || !('acc' in initial)) {
    throw new Error(
      'No `ms`/`acc` vars found — is profiler.js loaded and active on the device?',
    )
  }

  console.log('Auto-tuning inner-loop count …')
  const iters = await autoTuneIters(conn)
  console.log(`Using iters=${iters}.\n`)

  // Baseline first; every op nets against it.
  const baselineMs = await measure(conn, 0, iters)
  console.log(`baseline (identity) frame = ${baselineMs.toFixed(2)} ms\n`)

  const results: Result[] = []
  for (const op of OPS) {
    process.stdout.write(`  profiling ${op.name} … `)
    const frameMs = op.fn === 0 ? baselineMs : await measure(conn, op.fn, iters)
    const netMs = frameMs - baselineMs
    const perIterUs = (netMs / iters) * 1000
    results.push({ op, frameMs, netMs, perIterUs, relMul: 0 })
    console.log(`${frameMs.toFixed(2)} ms (net ${netMs.toFixed(2)} ms)`)
  }

  // Normalize to a multiply (fn=1).
  const mul = results.find((r) => r.op.fn === 1)
  const mulPerIterUs = mul && mul.perIterUs > 0 ? mul.perIterUs : NaN
  for (const r of results) {
    r.relMul = Number.isFinite(mulPerIterUs) ? r.perIterUs / mulPerIterUs : NaN
  }

  conn.close()

  const report = buildReport(results, baselineMs, iters, mulPerIterUs)
  const out = join(HERE, 'costs.md')
  writeFileSync(out, report)
  console.log(`\nCost table written to ${out}`)
}

main().catch((err) => {
  console.error('\nProfiler failed:', err.message)
  process.exit(1)
})
