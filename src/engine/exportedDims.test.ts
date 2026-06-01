import { exportedDims, dimLabel } from './exportedDims'

describe('exportedDims', () => {
  it('detects a single render fn', () => {
    expect(exportedDims('export function render(index) {}')).toEqual([1])
    expect(exportedDims('export function render2D(index, x, y) {}')).toEqual([2])
    expect(exportedDims('function render3D(index, x, y, z) {}')).toEqual([3])
  })

  it('does not let render swallow render2D / render3D', () => {
    expect(exportedDims('export function render2D(i,x,y){}')).toEqual([2])
    expect(exportedDims('export function render3D(i,x,y,z){}')).toEqual([3])
  })

  it('lists every defined dimension, ascending', () => {
    const src = 'function render3D(){} export function render(){}'
    expect(exportedDims(src)).toEqual([1, 3])
  })

  it('detects assignment form', () => {
    expect(exportedDims('render2D = function(i,x,y){}')).toEqual([2])
    expect(exportedDims('render = (index) => {}')).toEqual([1])
  })

  it('returns empty when no render fn is defined', () => {
    expect(exportedDims('export function beforeRender(delta) {}')).toEqual([])
  })

  it('formats a list cue', () => {
    expect(dimLabel('export function render2D(){}')).toBe('2D')
    expect(dimLabel('function render(){} function render3D(){}')).toBe('1D | 3D')
    expect(dimLabel('var t = 0')).toBe('')
  })
})
