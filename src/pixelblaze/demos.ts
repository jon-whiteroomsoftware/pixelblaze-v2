const rawDemos = import.meta.glob('./demos/*.js', {
  query: '?raw',
  import: 'default',
  eager: true,
})

export const DEMOS: Record<string, string> = Object.fromEntries(
  Object.entries(rawDemos).map(([path, src]) => {
    const name = path.replace('./demos/', '').replace('.js', '')
    return [name, src as string]
  }),
)
