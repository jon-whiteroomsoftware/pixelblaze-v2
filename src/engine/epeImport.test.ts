import { parseEpe } from './epeImport'

const validEpe = JSON.stringify({
  name: 'Doom Fire',
  id: 'abc123',
  sources: { main: 'export function render(i) { hsv(i, 1, 1) }' },
  preview: 'base64...',
})

describe('parseEpe', () => {
  it('extracts name and src from a valid EPE', () => {
    const result = parseEpe(validEpe)
    expect(result.name).toBe('Doom Fire')
    expect(result.src).toBe('export function render(i) { hsv(i, 1, 1) }')
  })

  it('trims whitespace from the name', () => {
    const epe = JSON.stringify({ name: '  My Pattern  ', sources: { main: 'code' } })
    expect(parseEpe(epe).name).toBe('My Pattern')
  })

  it('throws on invalid JSON', () => {
    expect(() => parseEpe('not json')).toThrow('invalid JSON')
  })

  it('throws when name is missing', () => {
    const epe = JSON.stringify({ sources: { main: 'code' } })
    expect(() => parseEpe(epe)).toThrow('missing a name')
  })

  it('throws when name is empty string', () => {
    const epe = JSON.stringify({ name: '   ', sources: { main: 'code' } })
    expect(() => parseEpe(epe)).toThrow('missing a name')
  })

  it('throws when sources is missing', () => {
    const epe = JSON.stringify({ name: 'Test' })
    expect(() => parseEpe(epe)).toThrow('missing sources')
  })

  it('throws when sources.main is missing', () => {
    const epe = JSON.stringify({ name: 'Test', sources: {} })
    expect(() => parseEpe(epe)).toThrow('missing sources.main')
  })

  it('throws when sources.main is not a string', () => {
    const epe = JSON.stringify({ name: 'Test', sources: { main: 42 } })
    expect(() => parseEpe(epe)).toThrow('missing sources.main')
  })
})
