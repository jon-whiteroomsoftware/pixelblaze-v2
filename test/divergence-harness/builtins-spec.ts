// What the divergence harness probes, and the reference each device result is
// compared against. Two kinds of entry:
//
//  - DIVERGENCE probes: sweep an input range, compute max|Δ| of the device's
//    fixed-point result against a float64 reference. Characterises transcendental
//    error (the numbers the fidelity PRD draws conclusions from).
//
//  - BEHAVIOUR probes: a few hand-picked inputs whose result discriminates
//    between competing firmware behaviours (wrap vs saturate, round vs truncate,
//    floored vs truncated mod/frac, etc.). The harness reports which candidate
//    the device matched.
//
//  - HASH probes: sweep integer inputs and assert the device result is
//    bit-identical (within one 16.16 ULP) to the fixed-point reference computed
//    here with `fx`. Confirms the Noise.js / Shader.js hash constants.
//
// FN codes MUST stay in sync with probe.js.

import { fx } from '../../src/engine/fixedpoint'

export const FN = {
  sin: 0, cos: 1, tan: 2, abs: 3, sqrt: 4, floor: 5, ceil: 6, frac: 7,
  mod: 8, mul: 9, not: 10, add: 11, hash11: 12, hash21: 13,
  exp: 14, log: 15, pow: 16,
  // #111 discriminators (localise where hash11 collapses to 0 on hardware)
  reint: 17, hash11_s1: 18, hash11_s2: 19,
} as const

/** One 16.16 ULP — the finest distinction the device can express in vars JSON. */
export const ULP = 1 / 65536

// ── fixed-point references for the hashes (mirror probe.js exactly) ───────────

/** floor of a raw 16.16 int — mask off the fractional bits (rounds toward -∞). */
function fxFloor(raw: number): number {
  return raw & ~0xffff
}

function fxHash11(nFloat: number): number {
  const C = (v: number) => fx.fromFloat(v)
  const n = C(nFloat)
  let h = fx.add(fx.mul(n, C(1619)), C(1013))
  h = fx.mul(h, fx.add(h, C(197)))
  h = fx.mul(h, C(769))
  const f = fx.mul(h, C(0.0000152587890625))
  return fx.toFloat(fx.sub(f, fxFloor(f)))
}

function fxHash21(ixFloat: number, iyFloat: number): number {
  const C = (v: number) => fx.fromFloat(v)
  const ix = C(ixFloat)
  const iy = C(iyFloat)
  let h = fx.add(fx.add(fx.mul(ix, C(1619)), fx.mul(iy, C(31337))), C(1013))
  h = fx.mul(h, fx.add(h, C(197)))
  h = fx.mul(h, C(769))
  const f = fx.mul(h, C(0.0000152587890625))
  return fx.toFloat(fx.sub(f, fxFloor(f)))
}

// #111 discriminator references — each mirrors the matching probe.js stage with
// `fx`, ending in the reinterpret-and-fract tail so the result is in [0,1).
function fxReint(nFloat: number): number {
  const C = (v: number) => fx.fromFloat(v)
  return fx.toFloat(fx.mul(C(nFloat), C(0.0000152587890625)))
}

function fxHash11Stage1(nFloat: number): number {
  const C = (v: number) => fx.fromFloat(v)
  const h = fx.add(fx.mul(C(nFloat), C(1619)), C(1013))
  const f = fx.mul(h, C(0.0000152587890625))
  return fx.toFloat(fx.sub(f, fxFloor(f)))
}

function fxHash11Stage2(nFloat: number): number {
  const C = (v: number) => fx.fromFloat(v)
  let h = fx.add(fx.mul(C(nFloat), C(1619)), C(1013))
  h = fx.mul(h, fx.add(h, C(197)))
  const f = fx.mul(h, C(0.0000152587890625))
  return fx.toFloat(fx.sub(f, fxFloor(f)))
}

// ── probe definitions ────────────────────────────────────────────────────────

export interface Sample {
  a: number
  b?: number
}

export interface DivergenceProbe {
  kind: 'divergence' | 'hash'
  name: string
  fn: number
  /** Inputs to sweep. */
  samples: Sample[]
  /** Float64 (divergence) or fixed-point (hash) reference value. */
  reference: (a: number, b: number) => number
}

export interface BehaviourCandidate {
  label: string
  value: number
}

export interface BehaviourProbe {
  kind: 'behaviour'
  name: string
  question: string
  fn: number
  a: number
  b?: number
  /** Competing predictions; the harness reports which the device matched. */
  candidates: BehaviourCandidate[]
}

export type Probe = DivergenceProbe | BehaviourProbe

/** Evenly spaced sweep of `count` samples over [lo, hi]. */
function sweep(lo: number, hi: number, count: number): number[] {
  const out: number[] = []
  for (let i = 0; i < count; i++) out.push(lo + ((hi - lo) * i) / (count - 1))
  return out
}

const N = 64

export const PROBES: Probe[] = [
  // ── transcendentals — divergence vs ideal float64 ──────────────────────────
  {
    kind: 'divergence', name: 'sin', fn: FN.sin,
    samples: sweep(-Math.PI, Math.PI, N).map((a) => ({ a })),
    reference: (a) => Math.sin(a),
  },
  {
    kind: 'divergence', name: 'cos', fn: FN.cos,
    samples: sweep(-Math.PI, Math.PI, N).map((a) => ({ a })),
    reference: (a) => Math.cos(a),
  },
  {
    kind: 'divergence', name: 'tan', fn: FN.tan,
    samples: sweep(-1.2, 1.2, N).map((a) => ({ a })),
    reference: (a) => Math.tan(a),
  },
  {
    kind: 'divergence', name: 'sqrt', fn: FN.sqrt,
    samples: sweep(0, 64, N).map((a) => ({ a })),
    reference: (a) => Math.sqrt(a),
  },
  {
    kind: 'divergence', name: 'exp', fn: FN.exp,
    samples: sweep(-4, 4, N).map((a) => ({ a })),
    reference: (a) => Math.exp(a),
  },
  {
    kind: 'divergence', name: 'log', fn: FN.log,
    samples: sweep(0.05, 64, N).map((a) => ({ a })),
    reference: (a) => Math.log(a),
  },
  {
    kind: 'divergence', name: 'pow', fn: FN.pow,
    samples: sweep(0, 8, N).map((a) => ({ a, b: 2.5 })),
    reference: (a) => Math.pow(a, 2.5),
  },

  // ── candidate integer hashes — must be bit-identical (fixed-point ref) ──────
  {
    kind: 'hash', name: 'hash11', fn: FN.hash11,
    samples: sweep(0, 255, 128).map((a) => ({ a: Math.round(a) })),
    reference: (a) => fxHash11(a),
  },
  {
    kind: 'hash', name: 'hash21', fn: FN.hash21,
    samples: sweep(0, 63, 32).flatMap((a) =>
      sweep(0, 63, 8).map((b) => ({ a: Math.round(a), b: Math.round(b) })),
    ),
    reference: (a, b) => fxHash21(a, b),
  },

  // ── #111 hash-collapse discriminators (bit-identical fixed-point ref) ───────
  {
    kind: 'hash', name: 'reint', fn: FN.reint,
    samples: sweep(0, 255, 64).map((a) => ({ a: Math.round(a) })),
    reference: (a) => fxReint(a),
  },
  {
    kind: 'hash', name: 'hash11_s1', fn: FN.hash11_s1,
    samples: sweep(0, 255, 64).map((a) => ({ a: Math.round(a) })),
    reference: (a) => fxHash11Stage1(a),
  },
  {
    kind: 'hash', name: 'hash11_s2', fn: FN.hash11_s2,
    samples: sweep(0, 255, 64).map((a) => ({ a: Math.round(a) })),
    reference: (a) => fxHash11Stage2(a),
  },

  // ── behaviour discriminators ───────────────────────────────────────────────
  {
    kind: 'behaviour', name: 'add-overflow', fn: FN.add,
    question: 'On 16.16 overflow, does the device WRAP or SATURATE?',
    // 30000 + 30000 = 60000 > 32767 max representable integer part.
    a: 30000, b: 30000,
    candidates: [
      // wrap: 60000 as int16 part wraps mod 65536 → 60000-65536 = -5536
      { label: 'wrap', value: 60000 - 65536 },
      { label: 'saturate', value: 32767 + ULP * 0xffff },
    ],
  },
  {
    kind: 'behaviour', name: 'mul-rounding', fn: FN.mul,
    question: 'After (a·b)>>16, does the device ROUND or TRUNCATE the dropped bits?',
    // raw(0.5)=0x8000, raw(0.5+ULP)=0x8001. Exact product = 0x40008000, i.e.
    // 0x4000 with exactly half a ULP (0x8000) in the dropped low word — so
    // truncate keeps 0.25 while round-half-up bumps to 0.25 + 1 ULP.
    a: 0.5, b: 0.5 + ULP,
    candidates: [
      { label: 'truncate', value: 0.25 },
      { label: 'round (half up)', value: 0.25 + ULP },
    ],
  },
  {
    kind: 'behaviour', name: 'frac-negative', fn: FN.frac,
    question: 'frac(-0.25): TRUNCATE-based (-0.25) or FLOOR-based (0.75)?',
    a: -0.25,
    candidates: [
      { label: 'truncate (sign follows a)', value: -0.25 },
      { label: 'floor (always [0,1))', value: 0.75 },
    ],
  },
  {
    kind: 'behaviour', name: 'mod-negative', fn: FN.mod,
    question: '-1 % 3: FLOORED (2, sign of b) or TRUNCATED (-1, sign of a)?',
    a: -1, b: 3,
    candidates: [
      { label: 'floored (sign of b)', value: 2 },
      { label: 'truncated (sign of a)', value: -1 },
    ],
  },
  {
    kind: 'behaviour', name: 'not-fractional', fn: FN.not,
    question: '~2.5: NOT of the raw 16.16 int, or NOT of the truncated integer part?',
    a: 2.5,
    candidates: [
      // ~raw(2.5) keeps the fraction: ~0x28000 = -0x28001 → -2.5 - 1 ULP
      { label: 'not-of-raw (keeps fraction)', value: fx.toFloat(~fx.fromFloat(2.5)) },
      // ~trunc(2.5) = ~2 = -3 — operand coerced to integer first
      { label: 'not-of-int-part', value: ~Math.trunc(2.5) },
    ],
  },
]
