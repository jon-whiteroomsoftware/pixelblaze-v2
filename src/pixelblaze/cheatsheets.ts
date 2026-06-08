export interface FunctionEntry {
  sig: string
  desc?: string
  plain?: boolean
}

export interface CheatsheetSection {
  header: string
  entries: FunctionEntry[]
}

export interface Cheatsheet {
  sections: CheatsheetSection[]
}

export const CHEATSHEETS: Record<string, Cheatsheet> = {
  PixelBlaze: {
    sections: [
      {
        header: 'Entry Points',
        entries: [
          { sig: 'render(index)', desc: 'called per pixel per frame (1D)' },
          { sig: 'render2D(index, x, y)', desc: 'called per pixel per frame (2D map)' },
          { sig: 'render3D(index, x, y, z)', desc: 'called per pixel per frame (3D map)' },
          { sig: 'beforeRender(delta)', desc: 'called once per frame; delta in ms' },
        ],
      },
      {
        header: 'Colour Output',
        entries: [
          { sig: 'hsv(h, s, v)', desc: 'set pixel; hue wraps 0..1; high dynamic range' },
          { sig: 'hsv24(h, s, v)', desc: '24-bit only; avoids flicker on some LEDs' },
          { sig: 'rgb(r, g, b)', desc: 'set pixel; all values 0..1' },
          { sig: 'setPalette(array)', desc: 'define gradient from position + RGB pairs' },
          { sig: 'paint(value[, brightness])', desc: 'set pixel from palette at value 0..1' },
        ],
      },
      {
        header: 'Time & Globals',
        entries: [
          { sig: 'time(interval)', desc: 'sawtooth 0→1, loops every 65.536×interval s' },
          { sig: 'pixelCount', desc: 'total configured LEDs' },
        ],
      },
      {
        header: 'Waveforms',
        entries: [
          { sig: 'wave(v)', desc: 'sawtooth → sine; output 0..1' },
          { sig: 'triangle(v)', desc: 'sawtooth → triangle; output 0..1' },
          { sig: 'square(v, duty)', desc: 'sawtooth → square; duty 0..1' },
          { sig: 'mix(lo, hi, w)', desc: 'linear interpolation; w is weight 0..1' },
          { sig: 'smoothstep(lo, hi, v)', desc: 'smooth Hermite interpolation; output 0..1' },
          { sig: 'bezierQuadratic(t, p0, p1, p2)', desc: 'quadratic Bézier at t' },
          { sig: 'bezierCubic(t, p0, p1, p2, p3)', desc: 'cubic Bézier at t' },
        ],
      },
      {
        header: 'Noise',
        entries: [
          { sig: 'perlin(x, y, z, seed)', desc: '3D Perlin noise; wraps every 256' },
          { sig: 'perlinFbm(x, y, z, lac, gain, oct)', desc: 'fractional Brownian motion' },
          { sig: 'perlinRidge(x, y, z, lac, gain, offset, oct)', desc: 'ridged Perlin noise' },
          { sig: 'perlinTurbulence(x, y, z, lac, gain, oct)', desc: 'turbulent Perlin noise' },
          { sig: 'setPerlinWrap(x, y, z)', desc: 'set wrap interval 2–256' },
        ],
      },
      {
        header: 'Math',
        entries: [
          { sig: 'abs · floor · ceil · round · trunc · frac', plain: true },
          { sig: 'min · max · clamp(v, lo, hi) · mod(x, y)', plain: true },
          { sig: 'sin · cos · tan · asin · acos · atan · atan2(y, x)', plain: true },
          { sig: 'sqrt · hypot(x, y) · hypot3(x, y, z)', plain: true },
          { sig: 'pow · exp · log · log2', plain: true },
          { sig: 'random(max)', desc: 'random float 0..max' },
          { sig: 'prng(max) · prngSeed(seed)', desc: 'seeded pseudorandom sequence' },
        ],
      },
      {
        header: 'Constants',
        entries: [
          { sig: 'PI  E  PI2  PI3_4  PISQ', plain: true },
          { sig: 'LN2  LN10  LOG2E  LOG10E  SQRT2  SQRT1_2', plain: true },
        ],
      },
    ],
  },

  Anim: {
    sections: [
      {
        header: 'Easing',
        entries: [
          { sig: 'easeIn2(t)', desc: 'quadratic ease-in: slow start, fast end' },
          { sig: 'easeOut2(t)', desc: 'quadratic ease-out: fast start, slow end' },
          { sig: 'easeInOut2(t)', desc: 'quadratic ease-in-out: slow at both ends' },
          { sig: 'easeIn3(t)', desc: 'cubic ease-in' },
          { sig: 'easeOut3(t)', desc: 'cubic ease-out' },
          { sig: 'easeInOut3(t)', desc: 'cubic ease-in-out' },
          { sig: 'easeIn4(t)', desc: 'quartic ease-in' },
          { sig: 'easeOut4(t)', desc: 'quartic ease-out' },
          { sig: 'easeInOut4(t)', desc: 'quartic ease-in-out' },
          { sig: 'easeOutElastic(t)', desc: 'overshoots and oscillates at end' },
          { sig: 'easeOutBounce(t)', desc: 'bounces like a rubber ball' },
          { sig: 'easeOutBack(t)', desc: 'overshoots slightly before settling' },
        ],
      },
      {
        header: 'Interpolation',
        entries: [
          { sig: 'lerp(a, b, t)', desc: 'linear interpolation from a to b' },
          { sig: 'smoothstep(lo, hi, t)', desc: 'smooth Hermite interpolation' },
          { sig: 'smootherstep(lo, hi, t)', desc: "Ken Perlin's improved smoothstep" },
          { sig: 'mapRange(v, inLo, inHi, outLo, outHi)', desc: 'remap v from one range to another' },
        ],
      },
      {
        header: 'Oscillators',
        entries: [
          { sig: 'saw(t, freq)', desc: 'sawtooth; ramps 0→1 at freq cycles per time unit' },
          { sig: 'squareWave(t, freq, duty)', desc: '1 for first duty fraction of cycle, 0 otherwise' },
          { sig: 'pingPong(t, freq)', desc: 'triangle wave; bounces 0→1→0' },
          { sig: 'sinPulse(t, freq)', desc: 'smooth sine pulse' },
          { sig: 'stagger(t, i, n)', desc: 'offset t by i/n; use for ripples across LEDs' },
        ],
      },
      {
        header: 'Timing Helpers',
        entries: [
          { sig: 'steps(t, n)', desc: 'quantise t into n discrete steps' },
          { sig: 'ramp(t, start, end)', desc: 'one-shot ramp; 1 at start, fades to 0 at end' },
          { sig: 'window01(t, start, end)', desc: '1 between start and end, 0 outside' },
          { sig: 'crossfade(a, b, t, lo, hi)', desc: 'crossfade a→b over [lo, hi] range of t' },
        ],
      },
      {
        header: 'Exponential Follow',
        entries: [
          { sig: 'follow(current, target, delta, speed)', desc: 'smoothly chase target each frame; call in beforeRender; try speed 3–10' },
        ],
      },
      {
        header: 'Sequencing',
        entries: [
          { sig: 'sequenceStep(t, n)', desc: 'current step index 0..n−1' },
          { sig: 'sequencePhase(t, n)', desc: 'phase within the current step 0..1' },
        ],
      },
    ],
  },

  Color: {
    sections: [
      {
        header: 'Hue Arithmetic',
        entries: [
          { sig: 'lerpHue(h0, h1, t)', desc: 'interpolate hue; takes shortest arc around wheel' },
          { sig: 'complementHue(h)', desc: 'hue directly opposite on the wheel' },
          { sig: 'analogousHue(h, f)', desc: 'hue offset by fraction f (try ±0.083 for ±30°)' },
          { sig: 'triadicHue(h, i)', desc: 'one of three evenly-spaced hues; i is 0, 1, or 2' },
        ],
      },
      {
        header: 'HSV Interpolation',
        entries: [
          { sig: 'lerpHSV(h0, s0, v0, h1, s1, v1, t)', desc: 'interpolate full HSV; writes outH, outS, outV' },
        ],
      },
      {
        header: 'Palettes',
        entries: [
          { sig: 'paletteLinear(t, hStart, hEnd)', desc: 'interpolate hue from hStart to hEnd' },
          { sig: 'fireHue(t) · fireValue(t) · fireSat(t)', desc: 'fire colour components' },
          { sig: 'iceHue(t) · iceSat(t) · iceValue(t)', desc: 'ice colour components' },
          { sig: 'rainbowHue(t)', desc: 'full-spectrum hue cycling' },
          { sig: 'neonHue(t) · neonSat() · neonValue(t)', desc: 'bright neon colour components' },
        ],
      },
      {
        header: 'Blend Modes',
        entries: [
          { sig: 'blendAdd(a, b)', desc: 'additive; clamped to 1' },
          { sig: 'blendMul(a, b)', desc: 'multiply' },
          { sig: 'blendScreen(a, b)', desc: 'screen; brighter than multiply' },
          { sig: 'blendOverlay(a, b)', desc: 'overlay; boosts contrast' },
          { sig: 'blendDifference(a, b)', desc: 'absolute difference' },
          { sig: 'blendHardLight(a, b)', desc: 'hard light; b controls contrast' },
          { sig: 'blendSoftLight(a, b)', desc: 'soft light; gentler contrast' },
          { sig: 'blendMax(a, b)', desc: 'lighter of the two values' },
          { sig: 'blendMin(a, b)', desc: 'darker of the two values' },
          { sig: 'blendMix(a, b, t)', desc: 'linear mix; t is weight 0..1' },
        ],
      },
      {
        header: 'Brightness',
        entries: [
          { sig: 'gamma(v, g)', desc: 'apply gamma correction; g>1 darkens midtones' },
          { sig: 'boost(v, amount)', desc: 'push brightness toward 1' },
          { sig: 'contrast(v, amount)', desc: 'increase or decrease contrast around 0.5' },
          { sig: 'tempToHSV(t)', desc: 'warm orange→yellow-white at brightness t; writes outH, outS, outV' },
        ],
      },
    ],
  },

  Coord: {
    sections: [
      {
        header: 'Polar',
        entries: [
          { sig: 'polarAngle(x, y)', desc: 'angle from grid centre (0.5, 0.5); returns 0..1' },
          { sig: 'angleFrom(x, y, cx, cy)', desc: 'angle from arbitrary centre; returns 0..1' },
          { sig: 'polarRadius(x, y)', desc: 'radius from grid centre; ≈1 at unit-circle edge' },
          { sig: 'radiusFrom(x, y, cx, cy)', desc: 'Euclidean distance from arbitrary centre' },
        ],
      },
      {
        header: 'Rotation',
        entries: [
          { sig: 'rotateX(x, y, cx, cy, a)', desc: 'rotated x around (cx, cy) by angle a (radians)' },
          { sig: 'rotateY(x, y, cx, cy, a)', desc: 'rotated y around (cx, cy) by angle a (radians)' },
        ],
      },
      {
        header: 'Scale',
        entries: [
          { sig: 'scaleX(x, cx, s)', desc: 'scale x around centre cx by factor s' },
          { sig: 'scaleY(y, cy, s)', desc: 'scale y around centre cy by factor s' },
        ],
      },
      {
        header: 'Mirror / Fold',
        entries: [
          { sig: 'mirrorX(x)', desc: 'fold x at 0.5; left half mirrors right' },
          { sig: 'mirrorY(y)', desc: 'fold y at 0.5; top half mirrors bottom' },
          { sig: 'mirrorAround(v, axis)', desc: 'fold v at an arbitrary axis point' },
        ],
      },
      {
        header: 'Tiling',
        entries: [
          { sig: 'tile(v, n)', desc: 'position within one cell of n equal tiles' },
          { sig: 'tileCell(v, n)', desc: 'which tile cell (0-indexed)' },
          { sig: 'tileMirror(v, n)', desc: 'alternating cells mirrored for seamless tiling' },
          { sig: 'repeatX(x, size)', desc: 'repeat space every size units; position in [−size/2, size/2]' },
          { sig: 'repeatY(y, size)', desc: 'same as repeatX for the y axis' },
        ],
      },
      {
        header: 'Symmetry & Remap',
        entries: [
          { sig: 'sectorAngle(angle, n)', desc: 'snap angle to nearest of n sectors' },
          { sig: 'foldAngle(angle, n)', desc: 'fold into one sector for rotational symmetry' },
          { sig: 'remap(v, inLo, inHi, outLo, outHi)', desc: 'map v from one range to another' },
          { sig: 'skewX(x, y, amount)', desc: 'shear x by y×amount' },
          { sig: 'skewY(x, y, amount)', desc: 'shear y by x×amount' },
        ],
      },
    ],
  },

  Noise: {
    sections: [
      {
        header: 'Value Noise',
        entries: [
          { sig: 'noise1D(x)', desc: 'smooth 1D value noise; range 0..1' },
          { sig: 'noise2D(x, y)', desc: 'smooth 2D value noise; range 0..1' },
        ],
      },
      {
        header: 'Gradient Noise',
        entries: [
          { sig: 'gradNoise2D(x, y)', desc: 'slightly more organic than value noise; range ≈0..1' },
        ],
      },
      {
        header: 'Fractal Brownian Motion',
        entries: [
          { sig: 'fbm2D_2(x, y)', desc: '2-octave fBm; practical balance of detail vs. speed' },
          { sig: 'fbm2D_3(x, y)', desc: '3-octave fBm; more detail' },
          { sig: 'fbm2D_4(x, y)', desc: '4-octave fBm; maximum detail' },
        ],
      },
      {
        header: 'Domain Warp',
        entries: [
          { sig: 'warpX(x, y, t, strength)', desc: 'displace x with noise; try strength 0.2–0.5' },
          { sig: 'warpY(x, y, t, strength)', desc: 'displace y with noise; try strength 0.2–0.5' },
        ],
      },
      {
        header: 'Voronoi',
        entries: [
          { sig: 'voronoiDist(x, y)', desc: 'distance to nearest cell centre; range ≈0..0.7' },
          { sig: 'voronoiDist4(x, y)', desc: 'directional 4-cell approximation for hardware-first patterns' },
          { sig: 'voronoiDist5(x, y)', desc: 'cheaper centre + cardinal-neighbour distance' },
          { sig: 'voronoiID(x, y)', desc: 'stable [0,1) float per cell; use for per-cell colour' },
        ],
      },
    ],
  },

  SDF: {
    sections: [
      {
        header: 'Primitive Shapes',
        entries: [
          { sig: 'circle(px, py, cx, cy, r)', desc: 'circle at (cx, cy) with radius r' },
          { sig: 'rect(px, py, cx, cy, hw, hh)', desc: 'axis-aligned rectangle; hw/hh are half-extents' },
          { sig: 'square(px, py, cx, cy, half)', desc: 'square; half is half-side length' },
          { sig: 'polygon(px, py, cx, cy, r, n)', desc: 'regular n-sided polygon; r is circumradius' },
          { sig: 'triangle(px, py, cx, cy, r)', desc: 'equilateral triangle; r is circumradius' },
          { sig: 'segment(px, py, ax, ay, bx, by)', desc: 'distance to line segment (ax,ay)→(bx,by)' },
          { sig: 'line(px, py, ax, ay, bx, by)', desc: 'signed distance to infinite line; left side negative' },
          { sig: 'ring(px, py, cx, cy, r, thickness)', desc: 'hollow circle; thickness sets ring width' },
          { sig: 'star(px, py, cx, cy, r, n, ratio)', desc: 'n-pointed star; ratio = inner/outer (try 0.4)' },
          { sig: 'pie(px, py, cx, cy, r, ha)', desc: 'wedge sector; ha = half-angle in radians' },
          { sig: 'cross(px, py, cx, cy, size, thickness)', desc: 'plus/cross shape' },
        ],
      },
      {
        header: 'Boolean Operations',
        entries: [
          { sig: 'union(a, b)', desc: 'minimum of two SDFs (OR)' },
          { sig: 'intersect(a, b)', desc: 'maximum of two SDFs (AND)' },
          { sig: 'subtract(a, b)', desc: 'cut shape b from shape a' },
          { sig: 'smoothUnion(a, b, k)', desc: 'blended union; k = blend radius' },
          { sig: 'smoothSubtract(a, b, k)', desc: 'blended subtraction' },
          { sig: 'offset(d, amount)', desc: 'expand (+) or contract (−) a shape' },
          { sig: 'annular(d, thickness)', desc: 'turn solid into a shell' },
        ],
      },
      {
        header: 'SDF → Brightness',
        entries: [
          { sig: 'fill(d)', desc: '1 inside, 0 outside; hard edge' },
          { sig: 'softFill(d, softness)', desc: 'antialiased fill; try softness 0.02' },
          { sig: 'glow(d, falloff)', desc: 'brightness centred on edge, fades over falloff' },
          { sig: 'fillGlow(d, falloff)', desc: 'full brightness inside + glow fading outside' },
          { sig: 'border(d, width)', desc: 'sharp ring along the edge' },
          { sig: 'bands(d, spacing)', desc: 'topographic bands radiating from the edge' },
        ],
      },
    ],
  },

  Shader: {
    sections: [
      {
        header: 'Scalar Gap-fillers',
        entries: [
          { sig: 'fract(x)', desc: 'floor-based x − floor(x), always 0..1 (frac() is truncate-based)' },
          { sig: 'step(edge, x)', desc: 'GLSL step: 0 below edge, 1 at/above' },
          { sig: 'sign(x)', desc: '−1 / 0 / 1' },
          { sig: 'saturate(x)', desc: 'clamp(x, 0, 1)' },
          { sig: 'dot2(ax, ay, bx, by)', desc: '2D dot product' },
          { sig: 'dot3(ax, ay, az, bx, by, bz)', desc: '3D dot product' },
          { sig: 'distance2(ax, ay, bx, by)', desc: 'Euclidean distance between two 2D points' },
        ],
      },
      {
        header: 'Out-var Helpers (read globals immediately after)',
        entries: [
          { sig: 'toUV(x, y, aspect)', desc: 'centred UVs → ux, uy; aspect = cols/rows, short axis = unit' },
          { sig: 'normalize2(x, y)', desc: 'unit vector → nx, ny (+ len)' },
          { sig: 'normalize3(x, y, z)', desc: 'unit vector → nx, ny, nz (+ len)' },
          { sig: 'rot2(x, y, angle)', desc: '2D rotation about origin → rx, ry' },
          { sig: 'reflect2(ix, iy, nx, ny)', desc: 'reflect across normalized normal → rx, ry' },
          { sig: 'reflect3(ix, iy, iz, nx, ny, nz)', desc: 'reflect across normalized normal → rx, ry, rz' },
        ],
      },
      {
        header: 'Palette & Hash',
        entries: [
          { sig: 'iqPalette(t, ar,ag,ab, br,bg,bb, cr,cg,cb, dr,dg,db)', desc: 'IQ cosine palette a+b·cos(2π(c·t+d)) → cr, cg, cb' },
          { sig: 'hash21(ix, iy)', desc: 'hardware-safe pseudo-random 0..1 from integer cell coords' },
          { sig: 'hash11(n)', desc: 'hardware-safe pseudo-random 0..1 from one integer' },
        ],
      },
    ],
  },
}
