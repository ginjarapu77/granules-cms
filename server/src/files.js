import path from 'path'

const MIME = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.zip': 'application/zip',
}

const ALLOWED = new Set(Object.keys(MIME))
export const MAX_BYTES = 50 * 1024 * 1024

const WORD = {
  jvs: 'JVs',
  jv: 'JV',
  ehs: 'EHS',
  iepf: 'IEPF',
  csr: 'CSR',
  iso: 'ISO',
  sa: 'SA',
  un: 'UN',
  ungc: 'UNGC',
}

const LABELS = {
  'iso-14001': 'ISO 14001',
  'iso-45001': 'ISO 45001',
  'sa-8000': 'SA 8000',
  'zero-waste-to-landfill': 'Zero Waste to Landfill',
  'water-neutrality': 'Water Neutrality',
  'annual-returns': 'Annual Returns',
  'other-disclosures': 'Other Disclosures',
  standalone: 'Standalone',
}

export function isPeriod(segment) {
  return /^(19|20)\d{2}$/.test(segment) || /^FY\d{2}-\d{2}$/i.test(segment) || segment.toLowerCase() === 'undated'
}

export function humanize(slug) {
  if (LABELS[slug]) return LABELS[slug]
  return slug
    .split('-')
    .filter(Boolean)
    .map((word) => WORD[word] || word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
}

export function safeFilename(name) {
  const base = path.basename(String(name || '')).normalize('NFKC')
  const ext = path.extname(base).toLowerCase()
  const stem = base.slice(0, base.length - path.extname(base).length)
  const cleanStem = stem
    .replace(/&/g, ' and ')
    .replace(/[^A-Za-z0-9._ -]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return `${cleanStem || 'document'}${ext}`
}

export function titleFromFilename(filename) {
  const stem = String(filename || '').replace(/\.[^.]+$/, '')
  const title = stem.replace(/[_]+/g, ' ').replace(/-/g, ' ').replace(/\s+/g, ' ').trim()
  return title || filename
}

export function typeFromName(filename) {
  return MIME[path.extname(filename).toLowerCase()] || 'application/octet-stream'
}

export function kindFromName(filename) {
  const ext = path.extname(filename).toLowerCase()
  if (ext === '.pdf') return 'pdf'
  if (['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) return 'image'
  if (['.mp3', '.wav'].includes(ext)) return 'audio'
  if (ext === '.mp4') return 'video'
  if (ext === '.zip') return 'archive'
  return 'document'
}

export function headerFilename(name) {
  const cleaned = String(name || 'document').replace(/[^\w.\- ()]+/g, '_')
  return cleaned || 'document'
}

export function validateFile(file) {
  if (!file?.buffer?.length) {
    const error = new Error('Choose a file to upload.')
    error.status = 400
    throw error
  }
  const ext = path.extname(file.originalname || '').toLowerCase()
  if (!ALLOWED.has(ext)) {
    const error = new Error('Upload a PDF, Office document, image, audio, video, or zip archive.')
    error.status = 400
    throw error
  }
  if (file.size > MAX_BYTES) {
    const error = new Error('Files must be 50 MB or smaller.')
    error.status = 400
    throw error
  }
  if (ext === '.pdf') {
    const head = file.buffer.subarray(0, 5).toString('utf8')
    if (!head.startsWith('%PDF')) {
      const error = new Error('That file is not a valid PDF.')
      error.status = 400
      throw error
    }
  }
}
