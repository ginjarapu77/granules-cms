import crypto from 'crypto'
import { config } from './config.js'
import { httpError } from './errors.js'
import { buildNavigation, findByPrefix } from './catalog.js'
import {
  isPeriod,
  kindFromName,
  safeFilename,
  slugify,
  titleFromFilename,
  typeFromName,
  validateFile,
} from './files.js'
import { deleteKey, getJson, listAllObjects, moveObject, putBuffer, putJson, signedUrl } from './s3.js'

const INDEX_KEY = 'cms/index.json'
const NAV_KEY = 'cms/navigation.json'
const PAGES_KEY = 'cms/pages.json'

let records = new Map()
let categories = []
let pages = []
let hydrated = false
let ready = false
let chain = Promise.resolve()

function locked(work) {
  const run = chain.then(work, work)
  chain = run.then(() => {}, () => {})
  return run
}

function snapshot() {
  return [...records.values()].sort((a, b) => a.id.localeCompare(b.id))
}

async function persistRecords() {
  await putJson(INDEX_KEY, {
    version: 1,
    updatedAt: new Date().toISOString(),
    records: snapshot(),
  })
}

function skipObject(key) {
  if (key.startsWith('cms/') && !key.startsWith('cms/drafts/')) return true
  return false
}

function describe(key) {
  if (key.startsWith('cms/drafts/')) {
    return {
      filename: key.split('/').pop(),
      folderPrefix: '',
      year: null,
      status: 'draft',
    }
  }
  const parts = key.split('/')
  const filename = parts.pop()
  let year = null
  const folders = []
  for (const part of parts) {
    if (isPeriod(part)) year = /^FY/i.test(part) ? part.toUpperCase() : part
    else folders.push(part)
  }
  return {
    filename,
    year,
    folderPrefix: folders.length ? `${folders.join('/')}/` : '',
    status: 'published',
  }
}

function reconcile(existing, objects) {
  const byKey = new Map(existing.map((record) => [record.key, record]))
  const next = new Map()
  for (const object of objects) {
    if (skipObject(object.key)) continue
    const previous = byKey.get(object.key)
    if (previous) {
      const newer = !previous.fileUpdatedAt || new Date(object.lastModified) > new Date(previous.fileUpdatedAt)
      next.set(previous.id, {
        ...previous,
        size: object.size,
        contentType: previous.contentType || typeFromName(previous.filename),
        kind: kindFromName(previous.filename),
        fileUpdatedAt: object.lastModified,
        updatedAt: newer ? object.lastModified : previous.updatedAt,
      })
      continue
    }
    const described = describe(object.key)
    const id = crypto.createHash('sha256').update(object.key).digest('hex').slice(0, 16)
    next.set(id, {
      id,
      key: object.key,
      folderPrefix: described.folderPrefix,
      year: described.year,
      title: titleFromFilename(described.filename),
      description: '',
      filename: described.filename,
      contentType: typeFromName(described.filename),
      kind: kindFromName(described.filename),
      size: object.size,
      publicationDate: (object.lastModified || '').slice(0, 10),
      status: described.status,
      createdAt: object.lastModified,
      updatedAt: object.lastModified,
      fileUpdatedAt: object.lastModified,
    })
  }
  return next
}

async function reindex() {
  const objects = await listAllObjects()
  let existing = []
  if (!hydrated) {
    const index = await getJson(INDEX_KEY)
    existing = Array.isArray(index?.records) ? index.records : []
    const navigation = await getJson(NAV_KEY)
    categories = Array.isArray(navigation?.categories) ? navigation.categories : []
    const pageFile = await getJson(PAGES_KEY)
    pages = Array.isArray(pageFile?.pages) ? pageFile.pages : []
    hydrated = true
  } else {
    existing = snapshot()
  }
  const next = reconcile(existing, objects)
  const previous = JSON.stringify([...existing].sort((a, b) => a.id.localeCompare(b.id)))
  const current = JSON.stringify(snapshotFrom(next))
  records = next
  if (previous !== current) {
    try {
      await persistRecords()
    } catch (error) {
      console.error(`Content index was not written to the bucket (${error.name || 'Error'}).`)
    }
  }
  return records.size
}

function snapshotFrom(map) {
  return [...map.values()].sort((a, b) => a.id.localeCompare(b.id))
}

export function isReady() {
  return ready
}

export async function init() {
  const count = await locked(() => reindex())
  ready = true
  console.log(`Indexed ${count} documents from s3://${config.bucket}`)
}

export function refresh() {
  return locked(async () => {
    const count = await reindex()
    return { documents: count }
  })
}

function navigation() {
  return buildNavigation(snapshot(), categories, pages.length)
}

export function getNavigation() {
  return navigation()
}

function requireText(value, label, max) {
  const text = String(value || '').trim()
  if (!text) throw httpError(400, `Enter a ${label}.`)
  if (text.length > max) throw httpError(400, `${label} must be ${max} characters or fewer.`)
  return text
}

function optionalText(value, max) {
  const text = String(value || '').trim()
  if (text.length > max) throw httpError(400, `Keep this field to ${max} characters or fewer.`)
  return text
}

function normalizePrefix(prefix) {
  const value = String(prefix || '').trim()
  if (!/^([a-z0-9]+(?:-[a-z0-9]+)*)(\/[a-z0-9]+(?:-[a-z0-9]+)*)*\/$/.test(value)) {
    throw httpError(400, 'Choose a category for this document.')
  }
  if (value.startsWith('cms/')) throw httpError(400, 'Documents cannot be stored in the system folder.')
  return value
}

function normalizeYear(value) {
  const year = String(value || '').trim()
  if (!year) return null
  if (/^(19|20)\d{2}$/.test(year)) return year
  if (/^FY\d{2}-\d{2}$/i.test(year)) return year.toUpperCase()
  if (year.toLowerCase() === 'undated') return 'undated'
  throw httpError(400, 'Use a year such as 2026 or FY25-26.')
}

function normalizeDate(value) {
  const date = String(value || '').trim()
  if (!date) return ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw httpError(400, 'Use a publication date in YYYY-MM-DD format.')
  return date
}

function normalizeStatus(value, fallback) {
  if (value === 'draft' || value === 'published') return value
  if (!value && fallback) return fallback
  return 'published'
}

function assertSafeKey(key) {
  if (!key || key.startsWith('/') || key.includes('..') || key.includes('\\') || key.includes('\0')) {
    throw httpError(400, 'The document path is not valid.')
  }
}

function yearValue(year) {
  if (!year || year.toLowerCase() === 'undated') return -1
  const financial = /^FY(\d{2})/i.exec(year)
  if (financial) return 2000 + Number(financial[1])
  const numeric = Number(year)
  return Number.isFinite(numeric) ? numeric : 0
}

function keyTaken(key, exceptId) {
  for (const record of records.values()) {
    if (record.key === key && record.id !== exceptId) return true
  }
  return false
}

function publicKey(folderPrefix, year, filename) {
  return `${folderPrefix}${year ? `${year}/` : ''}${filename}`
}

export function listContent(query) {
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20))
  const page = Math.max(1, Number(query.page) || 1)
  let rows = snapshot()
  if (query.prefix) rows = rows.filter((record) => record.folderPrefix?.startsWith(query.prefix))
  if (query.q) {
    const needle = String(query.q).trim().toLowerCase()
    rows = rows.filter((record) => `${record.title} ${record.filename} ${record.description}`.toLowerCase().includes(needle))
  }
  const years = [...new Set(rows.map((record) => record.year).filter(Boolean))].sort((a, b) => yearValue(b) - yearValue(a) || String(a).localeCompare(String(b)))
  const types = [...new Set(rows.map((record) => record.kind))].sort()
  if (query.year) rows = rows.filter((record) => record.year === query.year)
  if (query.status) rows = rows.filter((record) => record.status === query.status)
  if (query.type) rows = rows.filter((record) => record.kind === query.type)
  rows.sort((a, b) => (b.publicationDate || '').localeCompare(a.publicationDate || '') || a.title.localeCompare(b.title))
  const total = rows.length
  const start = (page - 1) * pageSize
  return {
    items: rows.slice(start, start + pageSize),
    total,
    page,
    pageSize,
    facets: { years, types },
  }
}

export function getContent(id) {
  const record = records.get(id)
  if (!record) throw httpError(404, 'That document was not found.')
  return record
}

export function dashboard() {
  const all = snapshot()
  const recent = [...all].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).slice(0, 8)
  return {
    documents: all.length,
    published: all.filter((record) => record.status === 'published').length,
    drafts: all.filter((record) => record.status === 'draft').length,
    pages: pages.length,
    bucket: config.bucket,
    region: config.region,
    recent,
  }
}

async function commitFile({ from, to, file, contentType, published }) {
  if (file && from === to) {
    await putBuffer(to, file.buffer, contentType, published)
    return
  }
  if (file) {
    await putBuffer(to, file.buffer, contentType, published)
    if (from) {
      try {
        await deleteKey(from)
      } catch (error) {
        await deleteKey(to).catch(() => {})
        throw error
      }
    }
    return
  }
  if (from && from !== to) await moveObject(from, to, contentType, published)
}

export function createContent(input, file) {
  return locked(async () => {
    validateFile(file)
    const title = requireText(input.title, 'title', 200)
    const folderPrefix = normalizePrefix(input.folderPrefix)
    const year = normalizeYear(input.year)
    const status = normalizeStatus(input.status)
    const publicationDate = normalizeDate(input.publicationDate) || new Date().toISOString().slice(0, 10)
    const description = optionalText(input.description, 5000)
    const filename = safeFilename(file.originalname)
    const id = crypto.randomBytes(8).toString('hex')
    const key = status === 'draft' ? `cms/drafts/${id}/${filename}` : publicKey(folderPrefix, year, filename)
    if (keyTaken(key)) throw httpError(409, 'A file with this name already exists in the selected folder.')
    assertSafeKey(key)
    try {
      await commitFile({ from: '', to: key, file, contentType: typeFromName(filename), published: status === 'published' })
    } catch (error) {
      console.error(error)
      throw httpError(502, 'The document could not be saved to storage.')
    }
    const now = new Date().toISOString()
    const record = {
      id,
      key,
      folderPrefix,
      year,
      title,
      description,
      filename,
      contentType: typeFromName(filename),
      kind: kindFromName(filename),
      size: file.size,
      publicationDate,
      status,
      createdAt: now,
      updatedAt: now,
      fileUpdatedAt: now,
    }
    const next = new Map(records)
    next.set(id, record)
    records = next
    await persistRecords()
    return record
  })
}

export function updateContent(id, input, file) {
  return locked(async () => {
    const current = records.get(id)
    if (!current) throw httpError(404, 'That document was not found.')
    if (file) validateFile(file)
    const title = input.title !== undefined ? requireText(input.title, 'title', 200) : current.title
    const description = input.description !== undefined ? optionalText(input.description, 5000) : current.description
    const publicationDate = input.publicationDate !== undefined
      ? (normalizeDate(input.publicationDate) || current.publicationDate)
      : current.publicationDate
    const status = normalizeStatus(input.status, current.status)
    const folderPrefix = input.folderPrefix !== undefined && input.folderPrefix !== ''
      ? normalizePrefix(input.folderPrefix)
      : current.folderPrefix
    if (!folderPrefix) throw httpError(400, 'Choose a category for this document.')
    const year = input.year !== undefined ? normalizeYear(input.year) : current.year
    const filename = file ? safeFilename(file.originalname) : current.filename
    const key = status === 'draft' ? `cms/drafts/${id}/${filename}` : publicKey(folderPrefix, year, filename)
    if (keyTaken(key, id)) throw httpError(409, 'A file with this name already exists in the selected folder.')
    assertSafeKey(key)
    const contentType = file ? typeFromName(filename) : current.contentType
    try {
      await commitFile({
        from: current.key,
        to: key,
        file,
        contentType,
        published: status === 'published',
      })
    } catch (error) {
      console.error(error)
      throw httpError(502, 'The document could not be saved to storage.')
    }
    const now = new Date().toISOString()
    const record = {
      ...current,
      key,
      folderPrefix,
      year,
      title,
      description,
      filename,
      contentType,
      kind: kindFromName(filename),
      size: file ? file.size : current.size,
      publicationDate,
      status,
      updatedAt: now,
      fileUpdatedAt: file || key !== current.key ? now : current.fileUpdatedAt,
    }
    const next = new Map(records)
    next.set(id, record)
    records = next
    await persistRecords()
    return record
  })
}

export function removeContent(id) {
  return locked(async () => {
    const current = records.get(id)
    if (!current) throw httpError(404, 'That document was not found.')
    try {
      await deleteKey(current.key)
    } catch (error) {
      console.error(error)
      throw httpError(502, 'The document could not be deleted from storage.')
    }
    const next = new Map(records)
    next.delete(id)
    records = next
    await persistRecords()
  })
}

export async function contentUrl(id, download) {
  const record = getContent(id)
  try {
    const url = await signedUrl(record.key, {
      download,
      filename: record.filename,
      contentType: record.contentType,
    })
    return { url, filename: record.filename, kind: record.kind, contentType: record.contentType }
  } catch (error) {
    console.error(error)
    throw httpError(502, 'A preview link could not be created.')
  }
}

export function addCategory({ parentPrefix, name }) {
  return locked(async () => {
    const label = requireText(name, 'category name', 80)
    const slug = slugify(label)
    if (!slug || isPeriod(slug)) throw httpError(400, 'Choose a category name that is not a year.')
    const parent = parentPrefix ? normalizePrefix(parentPrefix) : ''
    const prefix = `${parent}${slug}/`
    const tree = navigation()
    if (findByPrefix(tree, prefix)) throw httpError(409, 'That category already exists.')
    if (parent && !findByPrefix(tree, parent)) throw httpError(400, 'The parent category was not found.')
    categories = [...categories, { name: label, slug, prefix, parentPrefix: parent }]
    await putJson(NAV_KEY, { categories })
    return { name: label, slug, prefix, parentPrefix: parent }
  })
}

export function listPages() {
  return [...pages].sort((a, b) => a.title.localeCompare(b.title))
}

export function getPage(slug) {
  const page = pages.find((item) => item.slug === slug)
  if (!page) throw httpError(404, 'That page was not found.')
  return page
}

export function savePage(input) {
  return locked(async () => {
    const title = requireText(input.title, 'title', 160)
    const slug = slugify(input.slug || title)
    if (!slug) throw httpError(400, 'Enter a page title.')
    const section = requireText(input.section || title, 'section', 80)
    const excerpt = optionalText(input.excerpt, 400)
    const body = String(input.body || '')
    if (body.length > 100000) throw httpError(400, 'Page content is too long.')
    const status = input.status === 'published' ? 'published' : 'draft'
    const now = new Date().toISOString()
    const previous = pages.find((item) => item.slug === slug)
    const page = {
      slug,
      title,
      section,
      excerpt,
      body,
      status,
      createdAt: previous?.createdAt || now,
      updatedAt: now,
    }
    pages = [...pages.filter((item) => item.slug !== slug), page]
    await putJson(PAGES_KEY, { pages })
    return page
  })
}

export function removePage(slug) {
  return locked(async () => {
    if (!pages.some((item) => item.slug === slug)) throw httpError(404, 'That page was not found.')
    pages = pages.filter((item) => item.slug !== slug)
    await putJson(PAGES_KEY, { pages })
  })
}
