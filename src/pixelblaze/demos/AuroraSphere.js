// Aurora Sphere — a geometry-aware sphere showcase. It reads the *surface
// equation* of whatever 3D map it's drawn on, not the map's placement
// algorithm: from the bare render3D(x,y,z) it recovers latitude and longitude
// about the cloud's own center, then paints latitude rings that ratchet up a
// level once per tick — blooming wide as they move — and a spinning great-ring,
// both through an aurora palette.
//
// Pole axis = y. Self-calibrating: it scans the pixel map ONCE on the first
// beforeRender to learn the center and radius, so it adapts to any roughly
// spherical map (the stock Sphere lattice, a custom cloud). A preview rebuild
// resets these module vars, which reseeds the calibration.
//
// Note: asin/atan2 are transcendental and algorithmically divergent in Precise
// mode (REFERENCE 8.4). This is a "what the preview can render" showcase, not a
// hardware-bit-faithful pattern — consistent with PlasmaNebula.

// ── Adjustable controls ────────────────────────────────────────────────────
// Each control var holds the raw 0..1 SLIDER POSITION; the pattern derives the
// physical quantity from it (bands, spin rate, tick rate). This is what lets the
// UI seed the slider straight from the var's initial value — so these defaults
// ARE the opening slider positions.
export var ringCount = 0.5    // 0.5 -> 6 latitude bands (see nBands below)
export var spin = 0.81        // 0.5 = still; higher spins faster
export var speed = 0.4        // ring-tick rate; 0.5 -> once/sec (see beforeRender)

export function sliderRingCount(v) { ringCount = v }
export function sliderSpin(v) { spin = v }
export function sliderSpeed(v) { speed = v }

// Sample the fixed aurora ramp into RGB module vars (_pr/_pg/_pb). The original
// array scan was specialized into these branches: same output, less per-pixel
// palette work. Sampling here instead of paint() lets the latitude rings and
// great-ring add as light where they overlap.
var _pr = 0, _pg = 0, _pb = 0
function samplePalette(pos) {
  pos = pos - floor(pos)                 // wrap into 0..1
  var loPos = 0, hiPos = 0.25
  var lr = 0, lg = 0.04, lb = 0.06
  var hr = 0, hg = 0.42, hb = 0.22
  if (pos >= 0.85) {
    loPos = 0.85; hiPos = 1.00
    lr = 0.55; lg = 0.22; lb = 0.98
    hr = 0.92; hg = 0.30; hb = 0.78
  } else if (pos >= 0.68) {
    loPos = 0.68; hiPos = 0.85
    lr = 0.30; lg = 0.85; lb = 0.95
    hr = 0.55; hg = 0.22; hb = 0.98
  } else if (pos >= 0.48) {
    loPos = 0.48; hiPos = 0.68
    lr = 0.22; lg = 0.95; lb = 0.50
    hr = 0.30; hg = 0.85; hb = 0.95
  } else if (pos >= 0.25) {
    loPos = 0.25; hiPos = 0.48
    lr = 0.00; lg = 0.42; lb = 0.22
    hr = 0.22; hg = 0.95; hb = 0.50
  }
  var t = (pos - loPos) / (hiPos - loPos)
  _pr = lr + (hr - lr) * t
  _pg = lg + (hg - lg) * t
  _pb = lb + (hb - lb) * t
}

// ── Self-calibration cache (reset on every preview rebuild) ──────────────────
var calibrated = 0
var cx, cy, cz       // center (centroid of the map)
var radius           // mean distance from center

// Accumulators for the two mapPixels passes (centroid, then mean radius).
var _sx, _sy, _sz, _sr, _n

// Position-only geometry cache. Arrays are permanent on Pixelblaze, so this is
// meant for bounded demo panels; a pixel-count change allocates a fresh set.
var geomCount = 0
var geomReady, latNCache, pxCache, pyCache, pzCache

function _accumCenter(index, x, y, z) {
  _sx += x; _sy += y; _sz += z; _n += 1
}
function _accumRadius(index, x, y, z) {
  var dx = x - cx, dy = y - cy, dz = z - cz
  _sr += sqrt(dx * dx + dy * dy + dz * dz)
}

function calibrate() {
  _sx = 0; _sy = 0; _sz = 0; _n = 0
  mapPixels(_accumCenter)
  if (_n <= 0) return            // no map yet; retry next frame
  cx = _sx / _n; cy = _sy / _n; cz = _sz / _n
  _sr = 0
  mapPixels(_accumRadius)
  radius = _sr / _n
  if (radius <= 0) radius = 1
  calibrated = 1
}

function ensureGeometryCache() {
  if (pixelCount <= 0) return
  if (geomCount != pixelCount) {
    geomReady = array(pixelCount)
    latNCache = array(pixelCount)
    pxCache = array(pixelCount)
    pyCache = array(pixelCount)
    pzCache = array(pixelCount)
    geomCount = pixelCount
  }
}

// ── Animation phases (signed/zero-capable, so they accumulate, not time()) ───
// `ringPhase` carries exactly one ring-spacing per unit (the band period in
// latN is 1/ringCount and the wave argument scales latN by ringCount), so a
// step of 1 lifts every aligned latitude ring up to where its neighbour sat.
var tickPhase = 0   // accumulated ring ticks; its fraction drives one eased snap
var ringPhase = 0
var ringVel = 0     // normalized 0..1 tick velocity (0 at rest, 1 mid-snap)
var greatPhase = 0   // primary spin angle of the great-ring axis
var greatCycle = 0   // palette scroll phase swept through the great-ring band

// Great-ring normal (gnx/gny/gnz) — derives only from greatPhase, so it's the
// same for every pixel. Computed once per frame in beforeRender instead of
// recomputing ~5 trig/pixel (sin/cos of theta/phi + the wander sin) in render3D.
var gnx = 0, gny = 0, gnz = 0

// Fraction of each tick cycle the ring spends moving; the rest is a hold. A
// short move + long hold reads like an analog clock's second hand: a quick
// eased snap up a level, then a pause.
var TICK_MOVE = 0.45

export function beforeRender(delta) {
  if (!calibrated) calibrate()
  var dt = delta / 1000                 // ms -> seconds

  // Ring-tick rate from the Speed slider, mapped logarithmically so its midpoint
  // is the natural once-per-second cadence: 3^(2*speed-1) yields 1/3 Hz at 0 (a
  // tick every ~3s), 1 Hz at 0.5, and 3 Hz at 1 (three ticks a second).
  var tickHz = pow(3, 2 * speed - 1)
  tickPhase += dt * tickHz

  // Eased step per tick. Only the fractional ring-spacing matters (the band
  // field is periodic with period 1 in ringPhase), so a completed tick sits one
  // level up yet reads identically to the start — a seamless ratchet.
  var f = tickPhase - floor(tickPhase) // 0..1 within the current tick
  var k = clamp(f / TICK_MOVE, 0, 1)    // 0..1 over the move window, then held
  ringPhase = k * k * (3 - 2 * k)       // smoothstep ease in/out
  // The smoothstep's velocity is 6k(1-k): zero at rest, peaking mid-snap. Use
  // it (normalized to 0..1) to fatten the rings while they're moving fastest.
  ringVel = 4 * k * (1 - k)

  var spinRate = spin * 2 - 1            // 0..1 position -> -1..1, 0.5 = still
  greatPhase += dt * spinRate * 2.0      // signed; sits still at the midpoint
  greatCycle += dt * 0.35                // palette scroll through the great-ring

  // Great-ring axis: two incommensurate angles (azimuth theta + wandering polar
  // phi) drive an off-axis normal. All time-only — hoisted here so render3D just
  // reads gnx/gny/gnz. (Same expressions as before; pure relocation.)
  var theta = greatPhase
  var phi = greatPhase * 0.27 + 0.4 * sin(greatPhase * 0.23)
  var sp = sin(phi)
  gnx = sp * cos(theta)
  gny = cos(phi)
  gnz = sp * sin(theta)
}

export function render3D(index, x, y, z) {
  if (!calibrated) { rgb(0, 0, 0); return }
  ensureGeometryCache()
  var ix = floor(index)

  // Recover the surface coordinates from the bare position: project onto the
  // unit sphere about the calibrated center, then read latitude (pole = y) and
  // longitude. This is the surface equation, independent of how the map laid
  // its points out.
  if (!geomReady[ix]) {
    var cpx = (x - cx) / radius
    var cpy = (y - cy) / radius
    var cpz = (z - cz) / radius
    var len = hypot3(cpx, cpy, cpz)
    if (len > 0) { cpx /= len; cpy /= len; cpz /= len }

    // Bands stack along a pole axis tilted 45° from vertical (in the y-z plane),
    // so the rings march on a diagonal rather than straight up the viewport — more
    // interesting against the preview's slow default spin. `lat` is the signed
    // angle from that tilted equator; everything downstream is unchanged.
    var BAND_AY = 0.70710678, BAND_AZ = 0.70710678  // unit axis at 45°, x = 0
    var proj = cpy * BAND_AY + cpz * BAND_AZ
    var lat = asin(clamp(proj, -1, 1))   // -PI/2..PI/2 about the tilted axis
    latNCache[ix] = lat / PI + 0.5       // 0..1, one tilted pole -> the other
    pxCache[ix] = cpx; pyCache[ix] = cpy; pzCache[ix] = cpz
    geomReady[ix] = 1
  }
  var px = pxCache[ix], py = pyCache[ix], pz = pzCache[ix]
  var latN = latNCache[ix]

  // Pulsing latitude rings: sharpened sinusoidal bands marching along latitude,
  // breathing in intensity over time.
  // Ring thickness tracks tick velocity. Build a flat-topped band from the
  // signed distance to the nearest ring center and grow its half-width with
  // velocity — so the lit band genuinely fattens (a plateau spreading toward
  // its neighbours), rather than just a fixed peak brightening.
  var nBands = 1 + floor(ringCount * 11)  // 0..1 position -> 1..12 bands
  var u = latN * nBands - ringPhase
  var fr = u - floor(u)
  var dist = min(fr, 1 - fr) * 2          // 0 at ring center, 1 midway between
  // Half-width swings hard with tick velocity: crisp thin rings at rest, then
  // they bloom past their neighbours' midpoints at peak speed (>1 floods the
  // whole band lit) — an exaggerated swell as the rings ratchet up a level.
  var halfWidth = 0.26 + ringVel * 1.05
  var b = clamp(1 - dist / halfWidth, 0, 1)
  var struct = b * b * (3 - 2 * b)        // soft-edged plateau

  // Spinning great-ring: the great circle perpendicular to a precessing normal.
  // Spinning the axis on a SINGLE axis just rolls the ring around the pole (and
  // reads like the preview's own orbit). Instead drive the axis with two
  // incommensurate angles — an azimuth that spins and a polar angle that wanders
  // at an unrelated rate — so the ring tumbles off-axis and never quite repeats.
  // n (gnx/gny/gnz) is computed once per frame in beforeRender; it's already unit
  // length, so `dot` is the unit-sphere point's signed distance from the ring
  // plane, in [-1, 1].
  var dot = px * gnx + py * gny + pz * gnz

  // A fat band — half-thickness 0.2 of the unit radius, so the lit strip is
  // ~0.4 across = a fifth of the sphere's diameter. Soft edges spread the blend.
  var gband = clamp(1 - abs(dot) / 0.2, 0, 1)
  var great = gband * gband * (3 - 2 * gband)

  // The great-ring carries its own continuously scrolling palette: the across-
  // band signed distance gives a colour gradient and `greatCycle` scrolls it
  // over time.
  var grPos = greatCycle + dot * 1.2

  // Composite as additive light: sample each layer's own true colour and sum
  // them. No interpolation between palette POSITIONS (which smeared through every
  // colour in between) — just two real colours of light adding where they cross,
  // so the overlap genuinely blends and brightens.
  var baseV = struct
  var ringV = great * 0.95

  samplePalette(latN)
  var r = _pr * baseV, g = _pg * baseV, b = _pb * baseV

  samplePalette(grPos)
  r += _pr * ringV; g += _pg * ringV; b += _pb * ringV

  rgb(clamp(r, 0, 1), clamp(g, 0, 1), clamp(b, 0, 1))
}
