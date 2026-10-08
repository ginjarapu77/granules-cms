export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

export async function api(path, options = {}) {
  const headers = new Headers(options.headers || {})
  const token = sessionStorage.getItem('token')
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const response = await fetch(path, { ...options, headers })
  const text = await response.text()
  const data = text ? JSON.parse(text) : null
  if (response.status === 401 && !path.startsWith('/api/auth/login')) {
    sessionStorage.removeItem('token')
    if (!window.location.pathname.startsWith('/login')) window.location.assign('/login')
  }
  if (!response.ok) throw new ApiError(data?.error || 'The request could not be completed.', response.status)
  return data
}
