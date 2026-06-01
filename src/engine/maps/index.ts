export type { MapPoint, PixelMap, GridDims } from './types'
export { bakeMapSource, detectGridDims } from './bake'
export type { BakedMap } from './bake'
export { createPlaneMap, planePoint, squarePlaneDims } from './plane'
export type { PlaneParams } from './plane'
export { cubePixelCount } from './cube'
export { createCustomMap, inferDim } from './custom'
export type { Coord } from './custom'
export { evalMapSource } from './evalMapSource'
export { normalizeAspect, normalizeFill, applyNormalizeMode } from './normalize'
export type { NormalizeMode } from './normalize'
export { createSourceMap } from './sourceMap'
export type { SourceMapSpec } from './sourceMap'
export {
  STOCK_MAP_SPECS,
  SOURCE_STOCK_MAPS,
  SEED_MAP_IDS,
  stockMapSpec,
} from './stockCatalogue'
export {
  MAP_SKELETON,
  parseMapSource,
  isMapOpenable,
  isPristineToBaseline,
  mapTemplates,
} from './mapAuthoring'
export type { ParseError as MapParseError, MapTemplate } from './mapAuthoring'
