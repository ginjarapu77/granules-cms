import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(root, '.env') })

function required(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing ${name}. Copy server/.env.example to server/.env and set it.`)
  }
  return value
}

export const config = {
  port: Number(process.env.PORT || 4000),
  bucket: process.env.S3_BUCKET || 'granules-india-website-data',
  region: process.env.AWS_REGION || 'ap-south-1',
  adminEmail: (process.env.ADMIN_EMAIL || 'admin@granulesindia.com').trim().toLowerCase(),
  adminPassword: required('ADMIN_PASSWORD'),
  jwtSecret: required('JWT_SECRET'),
}
