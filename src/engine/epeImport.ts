export interface EpeFile {
  name: string
  src: string
}

export function parseEpe(text: string): EpeFile {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('Not a valid EPE file (invalid JSON)')
  }
  if (typeof data !== 'object' || data === null) {
    throw new Error('Not a valid EPE file')
  }
  const obj = data as Record<string, unknown>
  const name = obj['name']
  const sources = obj['sources']
  if (typeof name !== 'string' || !name.trim()) {
    throw new Error('EPE file is missing a name')
  }
  if (typeof sources !== 'object' || sources === null) {
    throw new Error('EPE file is missing sources')
  }
  const main = (sources as Record<string, unknown>)['main']
  if (typeof main !== 'string') {
    throw new Error('EPE file is missing sources.main')
  }
  return { name: name.trim(), src: main }
}
