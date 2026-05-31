import { cubePixelCount } from './cube'

describe('cubePixelCount', () => {
  it('counts side³ pixels', () => {
    expect(cubePixelCount(8)).toBe(512)
    expect(cubePixelCount(1)).toBe(1)
    expect(cubePixelCount(3)).toBe(27)
  })
})
