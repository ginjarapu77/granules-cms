import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { config } from './config.js'
import { headerFilename } from './files.js'

export const s3 = new S3Client({ region: config.region })

export async function listAllObjects() {
  const objects = []
  let token
  do {
    const response = await s3.send(new ListObjectsV2Command({
      Bucket: config.bucket,
      ContinuationToken: token,
      MaxKeys: 1000,
    }))
    for (const object of response.Contents || []) {
      if (!object.Key || object.Key.endsWith('/')) continue
      const modified = object.LastModified ? new Date(object.LastModified).toISOString() : new Date().toISOString()
      objects.push({
        key: object.Key,
        size: object.Size || 0,
        lastModified: modified,
      })
    }
    token = response.IsTruncated ? response.NextContinuationToken : undefined
  } while (token)
  return objects
}

export async function getJson(key) {
  try {
    const response = await s3.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }))
    const text = await response.Body.transformToString()
    return JSON.parse(text)
  } catch (error) {
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) return null
    throw error
  }
}

export async function putJson(key, value) {
  await s3.send(new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    Body: JSON.stringify(value),
    ContentType: 'application/json',
    CacheControl: 'no-store',
  }))
}

export async function putBuffer(key, body, contentType, published) {
  await s3.send(new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
    CacheControl: published ? 'public, max-age=300' : 'private, max-age=0',
  }))
}

export async function deleteKey(key) {
  await s3.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }))
}

export async function moveObject(from, to, contentType, published) {
  await s3.send(new CopyObjectCommand({
    Bucket: config.bucket,
    CopySource: `${config.bucket}/${from.split('/').map(encodeURIComponent).join('/')}`,
    Key: to,
    ContentType: contentType,
    MetadataDirective: 'REPLACE',
    CacheControl: published ? 'public, max-age=300' : 'private, max-age=0',
  }))
  try {
    await deleteKey(from)
  } catch (error) {
    await deleteKey(to).catch(() => {})
    throw error
  }
}

export async function signedUrl(key, { download, filename, contentType }) {
  const disposition = `${download ? 'attachment' : 'inline'}; filename="${headerFilename(filename)}"`
  const command = new GetObjectCommand({
    Bucket: config.bucket,
    Key: key,
    ResponseContentDisposition: disposition,
    ResponseContentType: contentType,
  })
  return getSignedUrl(s3, command, { expiresIn: 600 })
}
