import path from 'path'
import { fileURLToPath } from 'url'
import cors from 'cors'
import express from 'express'
import { existsSync } from 'fs'
import { config } from './config.js'
import { router } from './routes.js'
import { init } from './store.js'

const app = express()
app.disable('x-powered-by')
app.use(cors())
app.use(express.json({ limit: '1mb' }))
app.use('/api', router)

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist')
if (existsSync(dist)) {
  app.use(express.static(dist))
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next()
    return res.sendFile(path.join(dist, 'index.html'))
  })
}

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error)
  const status = error.status || 500
  if (status >= 500) console.error(error)
  res.status(status).json({
    error: status >= 500 ? 'Something went wrong while completing that request.' : error.message,
  })
})

init()
  .then(() => {
    app.listen(config.port, () => {
      console.log(`Granules CMS API listening on http://localhost:${config.port}`)
    })
  })
  .catch((error) => {
    console.error('Failed to index the content bucket.')
    console.error(error)
    process.exit(1)
  })
