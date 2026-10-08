export const KIND_LABEL = {
  pdf: 'PDF',
  image: 'Image',
  audio: 'Audio',
  video: 'Video',
  archive: 'Archive',
  document: 'Document',
}

export function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatBytes(size) {
  const value = Number(size) || 0
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

export function trailFor(tree, prefix) {
  if (!prefix) return []
  function walk(nodes, ancestors) {
    for (const node of nodes || []) {
      const next = [...ancestors, node]
      if (node.prefix === prefix) return next
      const found = walk(node.children, next)
      if (found) return found
    }
    return null
  }
  return walk(tree, []) || []
}

export function placement(tree, prefix) {
  const trail = trailFor(tree, prefix)
  return {
    module: trail[0]?.name || '—',
    category: trail[1]?.name || trail[0]?.name || '—',
    subcategory: trail.slice(2).map((node) => node.name).join(' / ') || '—',
  }
}

export function destinations(nodes, ancestors = []) {
  const options = []
  for (const node of nodes || []) {
    const trail = [...ancestors, node]
    if (node.prefix) {
      options.push({ prefix: node.prefix, label: trail.map((item) => item.name).join(' / ') })
    }
    options.push(...destinations(node.children, trail))
  }
  return options
}
