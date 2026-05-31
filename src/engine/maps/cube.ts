// Cube LAYOUT math. The stock cube's coordinate generation now lives in its
// source-backed `.js` (sources/cube.js, ADR-0008); this module keeps only the
// pure side³ count helper the preview uses to size the run loop to the lattice.

// The pixel count a cube map models: side³ (the renderer's freeze guard still
// caps the total). Exposed so the preview can size the run loop to the lattice.
export function cubePixelCount(side: number): number {
  return side * side * side
}
