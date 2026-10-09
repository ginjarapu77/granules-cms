import { Router } from 'express'
import multer from 'multer'
import { login, requireAuth } from './auth.js'
import { httpError } from './errors.js'
import { MAX_BYTES } from './files.js'
import {
  addCategory,
  contentUrl,
  createContent,
  dashboard,
  getContent,
  getNavigation,
  getPage,
  isReady,
  listContent,
  listPages,
  refresh,
  removeContent,
  removePage,
  savePage,
  updateContent,
} from './store.js'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
})

function wrap(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)
}

function withFile(handler) {
  return (req, res, next) => {
    upload.single('file')(req, res, (error) => {
      if (!error) return wrap(handler)(req, res, next)
      if (error.code === 'LIMIT_FILE_SIZE') return next(httpError(400, 'Files must be 50 MB or smaller.'))
      return next(httpError(400, 'The file could not be uploaded.'))
    })
  }
}

function ready(req, res, next) {
  if (!isReady()) return res.status(503).json({ error: 'The content index is still loading.' })
  return next()
}

export const router = Router()

router.get('/health', (req, res) => {
  res.json({ ok: true, ready: isReady() })
})

router.post('/auth/login', wrap(async (req, res) => {
  const result = login(req.body?.email, req.body?.password, req.ip || 'local')
  res.json(result)
}))

router.get('/auth/me', requireAuth, (req, res) => {
  res.json({ email: req.user.email, name: req.user.name })
})

// Public read-only endpoints (used by granulesindia.com frontend)
router.get('/public/documents', ready, wrap(async (req, res) => {
  const result = listContent({ ...req.query, status: 'published' })
  res.json(result)
}))

router.get('/public/index', ready, wrap(async (req, res) => {
  const result = listContent({ pageSize: 1000, status: 'published' })
  res.json({
    version: 1,
    records: result.items,
    total: result.total,
    navigation: getNavigation(),
  })
}))

router.get('/public/navigation', ready, wrap(async (req, res) => {
  res.json({ tree: getNavigation() })
}))

router.get('/public/pages/:slug', ready, wrap(async (req, res) => {
  const page = getPage(req.params.slug)
  if (page.status !== 'published') {
    return res.status(404).json({ error: 'Page not found or not published' })
  }
  res.json(page)
}))

router.use(requireAuth, ready)

router.get('/dashboard', wrap(async (req, res) => {
  res.json(dashboard())
}))

router.get('/navigation', wrap(async (req, res) => {
  res.json({ tree: getNavigation() })
}))

router.post('/navigation', wrap(async (req, res) => {
  const category = await addCategory({
    parentPrefix: req.body?.parentPrefix || '',
    name: req.body?.name,
  })
  res.status(201).json(category)
}))

router.post('/sync', wrap(async (req, res) => {
  res.json(await refresh())
}))

router.get('/content', wrap(async (req, res) => {
  res.json(listContent(req.query))
}))

router.post('/content', withFile(async (req, res) => {
  const record = await createContent(req.body || {}, req.file)
  res.status(201).json(record)
}))

router.get('/content/:id', wrap(async (req, res) => {
  res.json(getContent(req.params.id))
}))

router.get('/content/:id/url', wrap(async (req, res) => {
  res.json(await contentUrl(req.params.id, req.query.disposition === 'attachment'))
}))

router.put('/content/:id', withFile(async (req, res) => {
  res.json(await updateContent(req.params.id, req.body || {}, req.file))
}))

router.delete('/content/:id', wrap(async (req, res) => {
  await removeContent(req.params.id)
  res.json({ ok: true })
}))

router.get('/pages', wrap(async (req, res) => {
  res.json({ pages: listPages() })
}))

router.get('/pages/:slug', wrap(async (req, res) => {
  res.json(getPage(req.params.slug))
}))

router.put('/pages/:slug', wrap(async (req, res) => {
  const saved = await savePage({ ...req.body, slug: req.params.slug })
  res.json(saved)
}))

router.delete('/pages/:slug', wrap(async (req, res) => {
  await removePage(req.params.slug)
  res.json({ ok: true })
}))
