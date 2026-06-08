// Visual drift CLI. Compares two pattern sources over the same deterministic
// emulator frame window and reports "how different" they are, not just whether
// their checksums match.
//
//   npm run drift -- /tmp/base.js src/pixelblaze/demos/Kishimisu.js
//   npm run drift -- Kishimisu /tmp/Kishimisu.fast.js --mode precise

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, isAbsolute, join } from 'node:path'
import {
  compareVisualDrift,
  type BenchMode,
  type BenchOptions,
  type DriftMetrics,
  type GridSpec,
} from './benchCore'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '../..')
const DEMOS_DIR = join(ROOT, 'src/pixelblaze/demos')
const LIB_DIR = join(ROOT, 'src/pixelblaze/lib')

function loadLibraries(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const file of readdirSync(LIB_DIR)) {
    if (file.endsWith('.js')) {
      out[file.replace(/\.js$/, '')] = readFileSync(join(LIB_DIR, file), 'utf8')
    }
  }
  return out
}

function parseGrid(s: string): GridSpec {
  const parts = s.split('x').map((p) => parseInt(p, 10))
  if (
    (parts.length !== 2 && parts.length !== 3) ||
    parts.some((n) => !Number.isFinite(n) || n < 1)
  ) {
    throw new Error(`bad --grid "${s}" (use ROWSxCOLS or ROWSxCOLSxLAYERS)`)
  }
  const [rows, cols, layers] = parts
  return { rows, cols, layers }
}

interface Args {
  base?: string
  candidate?: string
  mode: BenchMode | 'both'
  threshold?: number
  options: BenchOptions
}

function parseArgs(argv: string[]): Args {
  const args: Args = { mode: 'both', options: {} }
  const positional: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--mode') {
      const mode = argv[++i]
      if (mode !== 'fast' && mode !== 'precise' && mode !== 'both') throw new Error(`bad --mode "${mode}"`)
      args.mode = mode
    } else if (a === '--frames') args.options.frames = parseInt(argv[++i], 10)
    else if (a === '--warmup') args.options.warmup = parseInt(argv[++i], 10)
    else if (a === '--grid') args.options.grid = parseGrid(argv[++i])
    else if (a === '--threshold') args.threshold = parseInt(argv[++i], 10)
    else if (a.startsWith('--')) throw new Error(`unknown flag ${a}`)
    else positional.push(a)
  }
  args.base = positional[0]
  args.candidate = positional[1]
  return args
}

function resolveSource(ref: string): { label: string; src: string } {
  const demoPath = join(DEMOS_DIR, `${ref.replace(/\.js$/, '')}.js`)
  const directPath = isAbsolute(ref) ? ref : join(ROOT, ref)
  const path = existsSync(demoPath) ? demoPath : directPath
  if (!existsSync(path)) throw new Error(`cannot find source "${ref}" (demo name or file path)`)
  return { label: ref, src: readFileSync(path, 'utf8') }
}

function pct(v: number): string {
  return `${(v * 100).toFixed(2)}%`
}

function fmtDrift(d: DriftMetrics): string {
  const speedDelta = (d.base.meanFrameMs - d.candidate.meanFrameMs) / d.base.meanFrameMs
  return [
    `  ${d.mode.padEnd(7)} base ${d.base.meanFrameMs.toFixed(3).padStart(8)} ms/frame  checksum ${d.base.checksum}`,
    `          cand ${d.candidate.meanFrameMs.toFixed(3).padStart(8)} ms/frame  checksum ${d.candidate.checksum}`,
    `          speed ${speedDelta >= 0 ? '+' : ''}${pct(speedDelta).padStart(8)}  mean ${d.meanAbs.toFixed(2).padStart(6)}/255  rmse ${d.rmse.toFixed(2).padStart(6)}  p95 ${String(d.p95).padStart(3)}  max ${String(d.max).padStart(3)}  changed>=${d.threshold} ${pct(d.changedPct)}`,
  ].join('\n')
}

function main(): void {
  const args = parseArgs(process.argv.slice(2))
  if (!args.base || !args.candidate) {
    console.log('Usage: npm run drift -- <base-demo-or-file> <candidate-demo-or-file> [--mode fast|precise|both] [--frames N] [--grid RxC] [--threshold N]')
    return
  }

  const base = resolveSource(args.base)
  const candidate = resolveSource(args.candidate)
  const libraries = loadLibraries()
  const options = { ...args.options, threshold: args.threshold }
  const modes: BenchMode[] = args.mode === 'both' ? ['fast', 'precise'] : [args.mode]

  console.log(`\nVisual drift: ${base.label} -> ${candidate.label}`)
  for (const mode of modes) {
    const drift = compareVisualDrift(base.src, candidate.src, libraries, mode, options)
    const dimLabel = { 1: '1D', 2: '2D', 3: '3D' }[drift.base.dimension]
    console.log(`\n${dimLabel}, ${drift.base.pixelCount} px, ${drift.base.frames} frames, ${drift.channels} RGB channels`)
    console.log(fmtDrift(drift))
  }
  console.log('')
}

main()
