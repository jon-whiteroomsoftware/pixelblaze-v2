// Anim — time-based animation, easing, and interpolation
//
// Convention: t is always a normalised 0..1 phase unless noted otherwise.
// Assumes Pixelblaze globals: sin, cos, abs, floor, min, max, clamp, pow, PI, wave

// ─── Easing ──────────────────────────────────────────────────────────────────

// Quadratic ease-in: slow start, fast end
function easeIn2(t)    { return t * t; }
// Quadratic ease-out: fast start, slow end
function easeOut2(t)   { return t * (2 - t); }
// Quadratic ease-in-out: slow at both ends
function easeInOut2(t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }

// Cubic ease-in
function easeIn3(t)    { return t * t * t; }
// Cubic ease-out
function easeOut3(t)   { var u = 1 - t; return 1 - u * u * u; }
// Cubic ease-in-out
function easeInOut3(t) { return t < 0.5 ? 4 * t * t * t : 1 - pow(-2 * t + 2, 3) / 2; }

// Quartic ease-in
function easeIn4(t)    { return t * t * t * t; }
// Quartic ease-out
function easeOut4(t)   { var u = 1 - t; return 1 - u * u * u * u; }
// Quartic ease-in-out
function easeInOut4(t) { return t < 0.5 ? 8 * t * t * t * t : 1 - pow(-2 * t + 2, 4) / 2; }

// Elastic: overshoots and oscillates at the end
function easeOutElastic(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return pow(2, -10 * t) * sin((t * 10 - 0.75) * (2 * PI) / 3) + 1;
}

// Bounce: bounces like a rubber ball
function easeOutBounce(t) {
  if (t < 1 / 2.75) {
    return 7.5625 * t * t;
  } else if (t < 2 / 2.75) {
    t -= 1.5 / 2.75;
    return 7.5625 * t * t + 0.75;
  } else if (t < 2.5 / 2.75) {
    t -= 2.25 / 2.75;
    return 7.5625 * t * t + 0.9375;
  } else {
    t -= 2.625 / 2.75;
    return 7.5625 * t * t + 0.984375;
  }
}

// Back: overshoots slightly before settling
function easeOutBack(t) {
  var c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * pow(t - 1, 3) + c1 * pow(t - 1, 2);
}

// ─── Interpolation ───────────────────────────────────────────────────────────

// Linear interpolation from a to b
function lerp(a, b, t) { return a + (b - a) * t; }

// Smooth Hermite interpolation; output 0..1
function smoothstep(lo, hi, t) {
  t = clamp((t - lo) / (hi - lo), 0, 1);
  return t * t * (3 - 2 * t);
}

// Ken Perlin's improved smoothstep; output 0..1
function smootherstep(lo, hi, t) {
  t = clamp((t - lo) / (hi - lo), 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

// Remap v from [inLo, inHi] to [outLo, outHi]
function mapRange(v, inLo, inHi, outLo, outHi) {
  return outLo + (v - inLo) / (inHi - inLo) * (outHi - outLo);
}

// ─── Oscillators ─────────────────────────────────────────────────────────────

// Sawtooth: ramps 0→1 at freq cycles per time unit
function saw(t, freq) { return (t * freq) % 1; }

// Square wave: 1 for first duty fraction of cycle, 0 otherwise (duty defaults to 0.5)
function squareWave(t, freq, duty) {
  duty = duty !== undefined ? duty : 0.5;
  return (t * freq) % 1 < duty ? 1 : 0;
}

// Triangle wave: bounces 0→1→0
function pingPong(t, freq) {
  var p = (t * freq) % 1;
  return p < 0.5 ? p * 2 : 2 - p * 2;
}

// Smooth sine pulse — wave() with explicit freq
function sinPulse(t, freq) { return wave(t * freq); }

// Stagger phase by index: offset t by i/n (use for ripples across LEDs)
function stagger(t, i, n) { return (t + i / n) % 1; }

// ─── Timing helpers ──────────────────────────────────────────────────────────

// Quantise t into n discrete steps
function steps(t, n) { return floor(t * n) / n; }

// One-shot ramp from 1 at start to 0 at end
function ramp(t, start, end) {
  return clamp((t - start) / (end - start), 0, 1);
}

// Pulse window: 1 between start and end, 0 outside
function window01(t, start, end) {
  return (t >= start && t < end) ? 1 : 0;
}

// Crossfade a→b over [lo,hi] range of t
function crossfade(a, b, t, lo, hi) {
  return lerp(a, b, smoothstep(lo, hi, t));
}

// ─── Exponential follow ──────────────────────────────────────────────────────
// Smoothly moves current toward target each frame.
// Call in beforeRender: myVal = follow(myVal, target, delta, speed)
// speed: higher = faster (try 3–10)
function follow(current, target, delta, speed) {
  var k = 1 - pow(2, -speed * delta * 0.001);
  return current + (target - current) * k;
}

// ─── Sequencing ──────────────────────────────────────────────────────────────

// Current step index (0..n-1) for time t
function sequenceStep(t, n) { return floor((t % 1) * n); }

// Phase within the current step (0..1)
function sequencePhase(t, n) { return (t * n) % 1; }
