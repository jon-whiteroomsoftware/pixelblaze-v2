// Hardware FPS bench (#248). The automated end of the optimization loop: take a
// demo (or a raw .js source file), bundle it, compile it to device bytecode using
// the device's *own* embedded compiler, push it run-only over the LAN, CONFIRM it
// is the active program, then sample the FPS the firmware reports. Compare two or
// more sources to read a before/after delta — the "hardware-wisdom" half of the
// guide that the emulator bench (bench.ts) structurally cannot measure.
//
//   PIXELBLAZE_IP=192.168.8.224 npm run devbench -- Kishimisu
//   PIXELBLAZE_IP=192.168.8.224 npm run devbench -- Kishimisu --vs /tmp/Kishimisu.baseline.js
//   PIXELBLAZE_IP=192.168.8.224 npm run devbench -- /tmp/a.js /tmp/b.js --settle 4000
//
// HUMAN-IN-THE-LOOP, OUT-OF-BAND: needs a physical Pixelblaze on the LAN. Touches
// the network, so it is excluded from the pre-commit gate (sibling to profiler.ts).
//
// Why this can run headless when the app routes compile through the Chrome
// extension: the extension only needs the sandboxed iframe because MV3 CSP forbids
// eval in a service worker. Node has no such restriction — we eval the extracted
// device compiler in a `vm` context with a `window` shim (exactly what the Python
// PoC did). The WS push + FPS readback reuse PixelblazeConnection wholesale, the
// same way profiler.ts already talks to hardware from Node.

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, basename } from 'node:path'
import vm from 'node:vm'
import WebSocket from 'ws'
import {
  PixelblazeConnection,
  type WebSocketLike,
} from '../../src/engine/PixelblazeConnection'
import { bundle } from '../../src/engine/bundle'
import {
  v3AdapterV3,
  buildCompilerEnv,
  missingComponents,
} from '../../src/engine/compilerExtraction'
import { bytecodeHeaderReconciles, makeProgramId } from '../../src/engine/bytecodePush'

const HERE = dirname(fileURLToPath(import.meta.url))
const DEMOS_DIR = join(HERE, '../../src/pixelblaze/demos')
const LIB_DIR = join(HERE, '../../src/pixelblaze/lib')
const IP = process.env.PIXELBLAZE_IP ?? '192.168.8.224'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ── library + demo loading (mirrors bench.ts) ────────────────────────────────

function loadLibraries(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const file of readdirSync(LIB_DIR)) {
    if (file.endsWith('.js')) {
      out[file.replace(/\.js$/, '')] = readFileSync(join(LIB_DIR, file), 'utf8')
    }
  }
  return out
}

/** Resolve a positional spec to { label, source }. A spec is either a demo name
 *  (found under demos/) or a path to a .js file. */
function resolveSource(spec: string): { label: string; source: string } {
  const asDemo = join(DEMOS_DIR, `${spec}.js`)
  if (existsSync(asDemo)) return { label: spec, source: readFileSync(asDemo, 'utf8') }
  if (existsSync(spec)) return { label: basename(spec), source: readFileSync(spec, 'utf8') }
  throw new Error(`no demo or file "${spec}" (looked in demos/ and as a path)`)
}

// ── device compile (the headless half of the extension's compile path) ───────

/** Fetch + gunzip + BOM-strip the device web UI. Mirrors background.js fetchWebUI. */
async function fetchWebUI(ip: string): Promise<string> {
  const resp = await fetch(`http://${ip}/index.html.gz`)
  if (!resp.ok) throw new Error(`GET index.html.gz -> ${resp.status}`)
  const gzBuf = await resp.arrayBuffer()
  const stream = new Response(gzBuf).body!.pipeThrough(new DecompressionStream('gzip'))
  let text = await new Response(stream).text()
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  return text
}

interface CompiledProgram {
  exports: { name: string; address: number }[]
  compiled: number[]
}

/** Build the device bytecode blob (mirrors extension/sandbox.js buildBytecode):
 *  DWORD opcodeBytes | DWORD exportBytes | int32 opcodes… | (DWORD addr + ascii + NUL)… */
function buildBytecode(program: CompiledProgram): Uint8Array {
  const { compiled: opcodes, exports } = program
  let exportSize = 0
  for (const s of exports) exportSize += 4 + s.name.length + 1
  const total = 8 + 4 * opcodes.length + exportSize
  const buf = new ArrayBuffer(total)
  const dv = new DataView(buf)
  let o = 0
  dv.setUint32(o, 4 * opcodes.length, true); o += 4
  dv.setUint32(o, exportSize, true); o += 4
  for (const op of opcodes) { dv.setInt32(o, op, true); o += 4 }
  for (const s of exports) {
    dv.setUint32(o, s.address, true); o += 4
    for (let k = 0; k < s.name.length; k++) { dv.setUint8(o, s.name.charCodeAt(k)); o += 1 }
    dv.setUint8(o, 0); o += 1
  }
  return new Uint8Array(buf)
}

/** Extract the device's compiler from its web UI and run it in a Node vm context
 *  (with a `window` shim) to turn flat device-dialect source into bytecode. */
function makeDeviceCompiler(webUI: string): (deviceSrc: string) => Uint8Array {
  const components = v3AdapterV3(webUI)
  const missing = missingComponents(components)
  if (missing.length > 0) {
    throw new Error(`compiler extraction miss: ${missing.join(', ')} — firmware adapter mismatch?`)
  }
  const env = buildCompilerEnv(components)
  // vm contexts get the standard intrinsics (Object/Array/Math/JSON); the device
  // compiler only additionally expects a writable `window` to attach itself to.
  const context = vm.createContext({ window: {} })
  vm.runInContext(env, context, { filename: 'device-compiler.js' })
  const compilePattern = (context as { compilePattern?: (s: string) => unknown }).compilePattern
  if (typeof compilePattern !== 'function') {
    throw new Error('compilePattern not defined after eval (extraction wrong?)')
  }
  return (deviceSrc: string) => {
    const out = compilePattern(deviceSrc) as
      | { status: 'OK'; exports: { name: string; address: number }[]; compiled: number[] }
      | { status: string }
    if (out.status !== 'OK') throw new Error(`device compiler: ${out.status}`)
    const bytecode = buildBytecode(out as CompiledProgram)
    if (!bytecodeHeaderReconciles(bytecode)) {
      throw new Error('compiled bytecode failed its header sanity check')
    }
    return bytecode
  }
}

// ── FPS sampling ─────────────────────────────────────────────────────────────

interface FpsStats {
  mean: number
  min: number
  max: number
  samples: number
}

/** Poll conn.fps over a window, discarding the settle period, and average the
 *  rest. The device streams `fps` in its periodic status frames; the connection
 *  captures the latest passively. */
async function sampleFps(
  conn: PixelblazeConnection,
  settleMs: number,
  sampleMs: number,
  stepMs = 250,
): Promise<FpsStats> {
  await sleep(settleMs)
  const vals: number[] = []
  let last = -1
  const end = Date.now() + sampleMs
  while (Date.now() < end) {
    const f = conn.fps
    if (typeof f === 'number' && f > 0 && f !== last) {
      vals.push(f)
      last = f
    }
    await sleep(stepMs)
  }
  if (vals.length === 0) throw new Error('device never reported a usable FPS')
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length
  return { mean, min: Math.min(...vals), max: Math.max(...vals), samples: vals.length }
}

// ── per-source measurement ───────────────────────────────────────────────────

interface Measurement {
  label: string
  fps: FpsStats
  frameMs: number
  programId: string
}

async function measureSource(
  conn: PixelblazeConnection,
  compile: (deviceSrc: string) => Uint8Array,
  libraries: Record<string, string>,
  label: string,
  source: string,
  settleMs: number,
  sampleMs: number,
): Promise<Measurement> {
  const { code } = bundle(source, libraries)
  const bytecode = compile(code)
  const programId = makeProgramId()

  process.stdout.write(`  ${label}: pushing (${bytecode.length} B, id ${programId}) … `)
  conn.pushByteCode(bytecode, { id: programId, name: '' })

  // Confirm the device is actually running what we pushed before trusting FPS.
  await sleep(400)
  const cfg = await conn.getConfig()
  if (cfg.activeProgramId !== programId) {
    throw new Error(
      `device did not switch to pushed pattern (activeProgramId=${cfg.activeProgramId ?? 'none'}, expected ${programId}) — not rendering it; FPS would be meaningless`,
    )
  }
  process.stdout.write('active ✓, sampling FPS …\n')

  const fps = await sampleFps(conn, settleMs, sampleMs)
  return { label, fps, frameMs: 1000 / fps.mean, programId }
}

// ── CLI ──────────────────────────────────────────────────────────────────────

interface Args {
  specs: string[]
  settleMs: number
  sampleMs: number
}

/** Parse a required numeric flag value, rejecting a missing or non-numeric arg. */
function intArg(flag: string, raw: string | undefined): number {
  const n = parseInt(raw ?? '', 10)
  if (!Number.isFinite(n)) throw new Error(`${flag} needs a number (got ${raw ?? 'nothing'})`)
  return n
}

function parseArgs(argv: string[]): Args {
  const args: Args = { specs: [], settleMs: 3000, sampleMs: 4000 }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--vs') continue // sugar; the next positional is just another spec
    else if (a === '--settle') args.settleMs = intArg(a, argv[++i])
    else if (a === '--sample') args.sampleMs = intArg(a, argv[++i])
    else if (a.startsWith('--')) throw new Error(`unknown flag ${a}`)
    else args.specs.push(a)
  }
  if (args.specs.length === 0) throw new Error('usage: npm run devbench -- <demo|file> [--vs <demo|file>] [--settle ms] [--sample ms]')
  return args
}

function nodeFactory(url: string): WebSocketLike {
  return new WebSocket(url) as unknown as WebSocketLike
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const sources = args.specs.map(resolveSource)
  const libraries = loadLibraries()

  console.log(`Fetching device compiler from http://${IP} …`)
  const webUI = await fetchWebUI(IP)
  const compile = makeDeviceCompiler(webUI)

  console.log(`Connecting to Pixelblaze at ws://${IP}:81 …`)
  const conn = new PixelblazeConnection({
    host: IP,
    webSocketFactory: nodeFactory,
    requestTimeoutMs: 5000,
  })
  conn.on('error', (e) => console.error('socket error:', e))
  await conn.connect()
  console.log('Connected.\n')

  const results: Measurement[] = []
  try {
    for (const { label, source } of sources) {
      results.push(
        await measureSource(conn, compile, libraries, label, source, args.settleMs, args.sampleMs),
      )
    }
  } finally {
    // Always release the socket — the device's WS pool is small, and a leak here
    // is exactly what makes the next run fail with ECONNRESET.
    conn.close()
  }

  console.log('\n── Results ─────────────────────────────────────────────')
  for (const r of results) {
    console.log(
      `  ${r.label.padEnd(24)} ${r.fps.mean.toFixed(2).padStart(6)} FPS   ` +
        `${r.frameMs.toFixed(2).padStart(7)} ms/frame   ` +
        `(min ${r.fps.min.toFixed(1)} / max ${r.fps.max.toFixed(1)}, n=${r.fps.samples})`,
    )
  }
  if (results.length >= 2) {
    const a = results[0]
    const b = results[results.length - 1]
    const dFps = ((b.fps.mean - a.fps.mean) / a.fps.mean) * 100
    const dMs = b.frameMs - a.frameMs
    console.log(
      `\n  Δ ${a.label} → ${b.label}: ` +
        `${dFps >= 0 ? '+' : ''}${dFps.toFixed(1)}% FPS  ` +
        `(${dMs >= 0 ? '+' : ''}${dMs.toFixed(2)} ms/frame)`,
    )
  }
}

main().catch((err) => {
  console.error('\ndevbench failed:', err.message)
  process.exit(1)
})
