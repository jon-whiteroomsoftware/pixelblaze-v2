// Manual divergence harness — Phase 1 of the Hardware Connectivity feature.
//
// HUMAN-IN-THE-LOOP, OUT-OF-BAND. Requires a physical Pixelblaze on the LAN and
// the probe pattern (probe.js) hand-loaded via the stock ElectroMage editor.
// Excluded from the pre-commit gate (it touches real hardware / the network).
//
//   PIXELBLAZE_IP=192.168.1.50 npm run harness
//
// It drives the hand-loaded probe through the documented getVars/setVars API,
// sweeps inputs per builtins-spec.ts, computes per-built-in divergence (max|Δ|)
// and behaviour answers, prints a summary, and writes the committed report to
// test/divergence-harness/report.md.

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import WebSocket from 'ws'
import {
  PixelblazeConnection,
  type WebSocketLike,
} from '../../src/engine/PixelblazeConnection'
import {
  PROBES,
  ULP,
  type BehaviourProbe,
  type DivergenceProbe,
} from './builtins-spec'

const HERE = dirname(fileURLToPath(import.meta.url))
const IP = process.env.PIXELBLAZE_IP ?? '192.168.1.50'
const SETTLE_MS = 80 // let beforeRender run between setVars and getVars

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Node `ws` adapter satisfying the engine's WebSocketLike interface. */
function nodeFactory(url: string): WebSocketLike {
  return new WebSocket(url) as unknown as WebSocketLike
}

/** Set the probe inputs, wait a frame, read `probe` back. */
async function evaluate(
  conn: PixelblazeConnection,
  fn: number,
  a: number,
  b: number,
): Promise<number> {
  conn.setVars({ fn, a, b })
  await sleep(SETTLE_MS)
  const vars = await conn.getVars()
  return vars.probe
}

interface DivergenceResult {
  name: string
  kind: 'divergence' | 'hash'
  maxAbsDelta: number
  maxAtInput: string
  samples: number
  bitIdentical?: boolean // hash probes only
  dump?: { input: string; device: number; reference: number }[] // hash probes
}

interface BehaviourResult {
  name: string
  question: string
  device: number
  matched: string
  candidates: { label: string; value: number; delta: number }[]
}

async function runDivergence(
  conn: PixelblazeConnection,
  probe: DivergenceProbe,
): Promise<DivergenceResult> {
  let maxAbsDelta = 0
  let maxAtInput = ''
  const dump: { input: string; device: number; reference: number }[] = []
  for (let i = 0; i < probe.samples.length; i++) {
    const s = probe.samples[i]
    const b = s.b ?? 0
    const device = await evaluate(conn, probe.fn, s.a, b)
    const ref = probe.reference(s.a, b)
    const delta = Math.abs(device - ref)
    const inputLabel = s.b === undefined ? `a=${s.a}` : `a=${s.a}, b=${s.b}`
    if (delta > maxAbsDelta) {
      maxAbsDelta = delta
      maxAtInput = inputLabel
    }
    // Capture the first handful of hash samples as concrete evidence.
    if (probe.kind === 'hash' && i < 6) dump.push({ input: inputLabel, device, reference: ref })
  }
  return {
    name: probe.name,
    kind: probe.kind,
    maxAbsDelta,
    maxAtInput,
    samples: probe.samples.length,
    ...(probe.kind === 'hash' ? { bitIdentical: maxAbsDelta <= ULP * 1.5, dump } : {}),
  }
}

async function runBehaviour(
  conn: PixelblazeConnection,
  probe: BehaviourProbe,
): Promise<BehaviourResult> {
  const device = await evaluate(conn, probe.fn, probe.a, probe.b ?? 0)
  const candidates = probe.candidates.map((c) => ({
    label: c.label,
    value: c.value,
    delta: Math.abs(device - c.value),
  }))
  const best = candidates.reduce((m, c) => (c.delta < m.delta ? c : m))
  return {
    name: probe.name,
    question: probe.question,
    device,
    matched: best.delta <= ULP * 1.5 ? best.label : `UNRESOLVED (closest: ${best.label})`,
    candidates,
  }
}

function fmt(n: number): string {
  return Number.isFinite(n) ? n.toPrecision(8) : String(n)
}

function buildReport(
  divergence: DivergenceResult[],
  behaviour: BehaviourResult[],
  firmware: string,
): string {
  const now = new Date().toISOString().slice(0, 10)
  const lines: string[] = []
  lines.push('# Divergence report — preview vs Pixelblaze hardware')
  lines.push('')
  lines.push(`**Generated:** ${now}  `)
  lines.push(`**Device:** \`${IP}\`  `)
  lines.push(`**Firmware:** ${firmware}  `)
  lines.push(`**Resolution:** 16.16 fixed-point, 1 ULP = ${ULP} (${fmt(ULP)})`)
  lines.push('')
  lines.push(
    'Produced by `npm run harness` (test/divergence-harness). The probe pattern ' +
      'is hand-loaded via the ElectroMage editor; the harness drives it over the ' +
      'documented getVars/setVars API. This report is the Phase-1 deliverable that ' +
      'the fidelity feature draws its divergence conclusions from.',
  )
  lines.push('')

  lines.push('## Transcendentals — divergence vs ideal float64')
  lines.push('')
  lines.push('| built-in | samples | max \\|Δ\\| | (in ULPs) | worst input |')
  lines.push('|---|---|---|---|---|')
  for (const r of divergence.filter((d) => d.kind === 'divergence')) {
    lines.push(
      `| \`${r.name}\` | ${r.samples} | ${fmt(r.maxAbsDelta)} | ${(r.maxAbsDelta / ULP).toFixed(1)} | ${r.maxAtInput} |`,
    )
  }
  lines.push('')

  lines.push('## Candidate integer hashes — bit-identity preview↔hardware')
  lines.push('')
  lines.push('| hash | samples | max \\|Δ\\| | bit-identical? |')
  lines.push('|---|---|---|---|')
  for (const r of divergence.filter((d) => d.kind === 'hash')) {
    lines.push(
      `| \`${r.name}\` | ${r.samples} | ${fmt(r.maxAbsDelta)} | ${r.bitIdentical ? '✅ yes' : '❌ NO'} |`,
    )
  }
  lines.push('')
  for (const r of divergence.filter((d) => d.kind === 'hash' && d.dump?.length)) {
    lines.push(`<details><summary>${r.name} — sample values (device vs fixed-point reference)</summary>`)
    lines.push('')
    lines.push('| input | device | reference | Δ |')
    lines.push('|---|---|---|---|')
    for (const d of r.dump!) {
      lines.push(`| ${d.input} | ${fmt(d.device)} | ${fmt(d.reference)} | ${fmt(Math.abs(d.device - d.reference))} |`)
    }
    lines.push('')
    lines.push('</details>')
    lines.push('')
  }

  lines.push('## Firmware behaviour — confirmed answers')
  lines.push('')
  for (const r of behaviour) {
    lines.push(`### ${r.name}`)
    lines.push('')
    lines.push(`**Q:** ${r.question}  `)
    lines.push(`**Device returned:** \`${fmt(r.device)}\`  `)
    lines.push(`**→ ${r.matched}**`)
    lines.push('')
    lines.push('| candidate | predicted | \\|Δ\\| |')
    lines.push('|---|---|---|')
    for (const c of r.candidates) {
      lines.push(`| ${c.label} | ${fmt(c.value)} | ${fmt(c.delta)} |`)
    }
    lines.push('')
  }

  lines.push('## Interpretation & follow-ups')
  lines.push('')
  lines.push(
    'This file is auto-generated raw evidence. Hand-written interpretation and the ' +
      'filed follow-up issues live in [`findings.md`](./findings.md).',
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
  console.log('Connected. Reading device config …')

  // A getVars on connect also confirms the probe is loaded (probe var present).
  const initial = await conn.getVars()
  if (!('probe' in initial)) {
    throw new Error(
      'No `probe` var found — is probe.js loaded and active on the device?',
    )
  }
  const firmware = process.env.PIXELBLAZE_FW ?? 'unknown (set PIXELBLAZE_FW)'

  const divergence: DivergenceResult[] = []
  const behaviour: BehaviourResult[] = []
  for (const probe of PROBES) {
    process.stdout.write(`  probing ${probe.name} … `)
    if (probe.kind === 'behaviour') {
      const r = await runBehaviour(conn, probe)
      behaviour.push(r)
      console.log(r.matched)
    } else {
      const r = await runDivergence(conn, probe)
      divergence.push(r)
      console.log(
        `max|Δ|=${fmt(r.maxAbsDelta)}${r.bitIdentical === false ? '  ❌ NOT bit-identical' : ''}`,
      )
    }
  }

  conn.close()

  const report = buildReport(divergence, behaviour, firmware)
  const out = join(HERE, 'report.md')
  writeFileSync(out, report)
  console.log(`\nReport written to ${out}`)
}

main().catch((err) => {
  console.error('\nHarness failed:', err.message)
  process.exit(1)
})
