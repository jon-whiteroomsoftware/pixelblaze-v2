// Capability exploration spike — Phase 2 of the Hardware Connectivity feature
// (issue #108). HUMAN-IN-THE-LOOP, OUT-OF-BAND. Requires a physical Pixelblaze
// on the LAN. Excluded from the pre-commit gate (it touches real hardware and,
// optionally, writes to flash).
//
//   PIXELBLAZE_IP=192.168.8.224 PIXELBLAZE_FW=3.67 npm run spike
//
// It exercises the extended PixelblazeConnection protocol against the real
// device to establish empirically how far the API goes — listPrograms decode,
// getControls/setControls, brightness, activeProgramId, and the headline
// unknown: pattern push (putSourceCode). It captures pass/partial/fail plus raw
// evidence and writes the committed capability report to report.md.
//
// SAFETY: persistence probes use save:true at most once each, and the active
// program / brightness are restored at the end, to keep flash wear minimal.

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import WebSocket from 'ws'
import {
  PixelblazeConnection,
  type ProgramListEntry,
  type WebSocketLike,
} from '../../src/engine/PixelblazeConnection'

const HERE = dirname(fileURLToPath(import.meta.url))
const IP = process.env.PIXELBLAZE_IP ?? '192.168.8.224'
const FW = process.env.PIXELBLAZE_FW ?? 'unknown (set PIXELBLAZE_FW)'
const SETTLE_MS = 150

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Node `ws` adapter. We force arraybuffer-style binary so the engine's
 *  toUint8Array sees a typed payload (ws delivers Buffer, which is a Uint8Array,
 *  so this also works without the cast, but we keep it explicit). */
function nodeFactory(url: string): WebSocketLike {
  const ws = new WebSocket(url)
  ws.binaryType = 'arraybuffer'
  return ws as unknown as WebSocketLike
}

type Verdict = 'works' | 'partial' | 'fails' | 'unknown'

interface CapabilityResult {
  name: string
  verdict: Verdict
  note: string
  evidence: string[] // fenced/raw lines captured live
}

const results: CapabilityResult[] = []
function record(r: CapabilityResult): void {
  results.push(r)
  const icon = { works: '✅', partial: '🟡', fails: '❌', unknown: '❔' }[r.verdict]
  console.log(`\n${icon} ${r.name}: ${r.verdict}\n   ${r.note}`)
}

/** Run one capability probe; never let a single failure abort the whole spike. */
async function probe(
  name: string,
  fn: () => Promise<Omit<CapabilityResult, 'name'>>,
): Promise<void> {
  process.stdout.write(`Probing ${name} …`)
  try {
    record({ name, ...(await fn()) })
  } catch (err) {
    record({
      name,
      verdict: 'fails',
      note: `threw: ${(err as Error).message}`,
      evidence: [String((err as Error).stack ?? err)],
    })
  }
}

async function main(): Promise<void> {
  console.log(`Connecting to Pixelblaze at ws://${IP}:81 …`)
  const conn = new PixelblazeConnection({
    host: IP,
    webSocketFactory: nodeFactory,
    requestTimeoutMs: 6000,
  })
  conn.on('error', (e) => console.error('socket error:', e))
  await conn.connect()
  console.log('Connected.')

  let programs: ProgramListEntry[] = []
  let originalActive: string | undefined
  let originalBrightness: number | undefined

  // 1 ─ listPrograms binary-frame decode
  await probe('listPrograms (binary decode)', async () => {
    programs = await conn.listPrograms()
    const lines = programs.map((p) => `${p.id}\t${p.name}`)
    return {
      verdict: programs.length > 0 ? 'works' : 'partial',
      note: `decoded ${programs.length} program(s) from the type-7 binary frames`,
      evidence: lines.slice(0, 20),
    }
  })

  // 2 ─ activeProgramId round-trip (read via getConfig sequencer packet)
  await probe('activeProgramId round-trip', async () => {
    const before = await conn.getConfig()
    originalActive = before.activeProgramId
    originalBrightness = before.brightness
    const evidence = [`active before: ${originalActive ?? '(none reported)'}`]
    const target = programs.find((p) => p.id !== originalActive)
    if (!target) {
      return {
        verdict: 'partial',
        note: 'only one (or zero) programs present; could not test a switch',
        evidence,
      }
    }
    conn.setActiveProgram(target.id)
    await sleep(SETTLE_MS)
    const after = await conn.getConfig()
    evidence.push(`set active → ${target.id} (${target.name})`)
    evidence.push(`active after: ${after.activeProgramId ?? '(none reported)'}`)
    const ok = after.activeProgramId === target.id
    // leave `target` active for the controls probe; restored at the end
    return {
      verdict: ok ? 'works' : 'partial',
      note: ok
        ? 'set and confirmed the active program switched (read via getConfig)'
        : 'switch sent but getConfig did not confirm the new id',
      evidence,
    }
  })

  // 3 ─ getControls / setControls (no save), on a control-bearing program.
  // The getControls reply nests the slider map under the program id:
  //   { controls: { "<programId>": { sliderName: value, … } } }
  // so we unwrap that level before treating the entries as sliders.
  const sliderMap = (
    reply: { controls?: Record<string, unknown> },
    id: string,
  ): Record<string, number> => {
    const raw = reply.controls ?? {}
    const nested = raw[id]
    const map = nested && typeof nested === 'object' ? nested : raw
    return map as Record<string, number>
  }
  await probe('getControls / setControls', async () => {
    const evidence: string[] = []
    let chosen: { id: string; controls: Record<string, number> } | undefined
    for (const p of programs) {
      const map = sliderMap(await conn.getControls(p.id), p.id)
      const n = Object.keys(map).length
      evidence.push(`${p.name}: ${n} slider(s) ${n ? JSON.stringify(map) : ''}`)
      if (!chosen && n > 0) chosen = { id: p.id, controls: map }
    }
    if (!chosen) {
      return {
        verdict: 'partial',
        note: 'no program on the device exposes UI controls; round-trip not exercisable',
        evidence,
      }
    }
    // make the chosen program active, then round-trip one slider value.
    // A no-save setControls changes only the *live* values, so we confirm via
    // getConfig().activeControls — NOT getControls(id), which returns the stored
    // (flash) values and would never reflect a volatile change.
    conn.setActiveProgram(chosen.id)
    await sleep(SETTLE_MS)
    const k = Object.keys(chosen.controls)[0]
    const original = chosen.controls[k]
    const probed = original < 0.5 ? 0.75 : 0.25
    conn.setControls({ [k]: probed }, false)
    await sleep(SETTLE_MS)
    const liveAfter = (await conn.getConfig()).activeControls ?? {}
    const readBack = liveAfter[k]
    evidence.push(`— round-trip on ${chosen.id}, slider "${k}"`)
    evidence.push(`set ${k}=${probed} (no save); live read back: ${readBack}`)
    // also show the stored value is untouched (volatility evidence)
    const stored = sliderMap(await conn.getControls(chosen.id), chosen.id)[k]
    evidence.push(`stored (flash) value still: ${stored}`)
    conn.setControls({ [k]: original }, false) // restore live value
    const ok = typeof readBack === 'number' && Math.abs(readBack - probed) < 1e-3
    return {
      verdict: ok ? 'works' : 'partial',
      note: ok
        ? 'slider set without save, confirmed via live getConfig.activeControls; stored value unchanged (volatile). getControls(id) returns stored controls nested under the program id; live values come from getConfig'
        : 'setControls sent but the live value did not change',
      evidence,
    }
  })

  // 4 ─ brightness round-trip (no save), read via getConfig settings packet
  await probe('brightness', async () => {
    const before = await conn.getConfig()
    if (originalBrightness === undefined) originalBrightness = before.brightness
    const evidence = [`brightness before: ${before.brightness ?? '(not in reply)'}`]
    const probed = (before.brightness ?? 1) > 0.5 ? 0.2 : 0.8
    conn.setBrightness(probed, false)
    await sleep(SETTLE_MS)
    const after = await conn.getConfig()
    evidence.push(`set brightness=${probed} (no save)`)
    evidence.push(`brightness after: ${after.brightness ?? '(not in reply)'}`)
    const ok = Math.abs((after.brightness ?? NaN) - probed) < 1e-2
    return {
      verdict: ok ? 'works' : 'partial',
      note: ok
        ? 'brightness set and confirmed via getConfig (volatile — not saved)'
        : 'brightness command sent; getConfig did not confirm',
      evidence,
    }
  })

  // 5 ─ Pattern push (the headline unknown) — source-only, no bytecode
  await probe('pattern push (putSourceCode, source only)', async () => {
    const before = programs.length
    const probeName = `__spike_probe_${Date.now()}`
    const src = `// ${probeName}\nexport function render(index) {\n  hsv(0, 1, 1)\n}\n`
    conn.putSourceCode(src)
    await sleep(800)
    const after = await conn.listPrograms()
    const appeared = after.length !== before
    return {
      verdict: 'partial',
      note:
        'putSourceCode (source only, NO bytecode) sent. The device runs bytecode ' +
        'compiled by the ElectroMage editor in-browser; the IDE does not produce ' +
        `bytecode, so source-only push is not expected to create a runnable pattern. ` +
        `program count before=${before}, after=${after.length} (${appeared ? 'changed' : 'unchanged'}).`,
      evidence: [
        `pushed source:\n${src}`,
        `programs after push: ${after.map((p) => p.name).join(', ')}`,
        'See findings.md for the bytecode-compiler investigation and gate recommendation.',
      ],
    }
  })

  // restore device to its original state
  if (originalActive) conn.setActiveProgram(originalActive)
  if (originalBrightness !== undefined) conn.setBrightness(originalBrightness, false)
  await sleep(SETTLE_MS)
  conn.close()

  writeFileSync(join(HERE, 'report.md'), buildReport())
  console.log(`\nReport written to ${join(HERE, 'report.md')}`)
}

function buildReport(): string {
  const now = new Date().toISOString().slice(0, 10)
  const L: string[] = []
  L.push('# Capability report — Pixelblaze WebSocket protocol')
  L.push('')
  L.push(`**Generated:** ${now}  `)
  L.push(`**Device:** \`${IP}\`  `)
  L.push(`**Firmware:** ${FW}  `)
  L.push('')
  L.push(
    'Produced by `npm run spike` (test/capability-spike). Exercises the extended ' +
      '`PixelblazeConnection` against a real device to establish empirically what the ' +
      'protocol supports — the Phase-2 gate for the Hardware Connectivity UI arc (#108). ' +
      'This file is auto-generated raw evidence; hand-written interpretation and the gate ' +
      'recommendation live in [`findings.md`](./findings.md).',
  )
  L.push('')
  L.push('## Summary')
  L.push('')
  L.push('| capability | verdict | note |')
  L.push('|---|---|---|')
  const icon = { works: '✅ works', partial: '🟡 partial', fails: '❌ fails', unknown: '❔ unknown' }
  for (const r of results) {
    L.push(`| \`${r.name}\` | ${icon[r.verdict]} | ${r.note.replace(/\n/g, ' ')} |`)
  }
  L.push('')
  L.push('## Evidence')
  L.push('')
  for (const r of results) {
    L.push(`### ${r.name}`)
    L.push('')
    L.push(`**Verdict:** ${icon[r.verdict]}  `)
    L.push(`**Note:** ${r.note}`)
    L.push('')
    if (r.evidence.length) {
      L.push('```')
      for (const e of r.evidence) L.push(e)
      L.push('```')
      L.push('')
    }
  }
  return L.join('\n')
}

main().catch((err) => {
  console.error('\nSpike failed:', err.message)
  process.exit(1)
})
