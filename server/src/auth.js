import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import { config } from './config.js'
import { httpError } from './errors.js'

const attempts = new Map()

function digest(value) {
  return crypto.createHash('sha256').update(String(value)).digest()
}

function tooManyAttempts(ip) {
  const now = Date.now()
  const recent = (attempts.get(ip) || []).filter((time) => now - time < 10 * 60 * 1000)
  attempts.set(ip, recent)
  return recent.length >= 8
}

export function login(email, password, ip) {
  if (tooManyAttempts(ip)) {
    throw httpError(429, 'Too many sign-in attempts. Wait a few minutes and try again.')
  }
  const emailMatch = crypto.timingSafeEqual(digest(String(email || '').trim().toLowerCase()), digest(config.adminEmail))
  const passwordMatch = crypto.timingSafeEqual(digest(password || ''), digest(config.adminPassword))
  if (!emailMatch || !passwordMatch) {
    attempts.get(ip).push(Date.now())
    throw httpError(401, 'The email or password is incorrect.')
  }
  attempts.set(ip, [])
  const token = jwt.sign(
    { email: config.adminEmail, name: 'Administrator' },
    config.jwtSecret,
    { expiresIn: '12h' },
  )
  return {
    token,
    user: { email: config.adminEmail, name: 'Administrator' },
  }
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) return res.status(401).json({ error: 'Sign in to continue.' })
  try {
    req.user = jwt.verify(token, config.jwtSecret)
    return next()
  } catch {
    return res.status(401).json({ error: 'Your session has expired. Sign in again.' })
  }
}
