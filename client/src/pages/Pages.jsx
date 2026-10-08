import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { formatDate } from '../format'
import { Modal } from '../ui'

const SUGGESTED = [
  ['homepage', 'Homepage'],
  ['company', 'Company'],
  ['products', 'Products'],
  ['facilities', 'Facilities'],
  ['careers', 'Careers'],
  ['contact', 'Contact'],
]

export function Pages() {
  const [pages, setPages] = useState(null)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(null)
  const navigate = useNavigate()

  function load() {
    return api('/api/pages').then((data) => setPages(data.pages)).catch((err) => setError(err.message))
  }

  useEffect(() => {
    load()
  }, [])

  const existing = new Set((pages || []).map((page) => page.slug))

  return (
    <div className="stack">
      <div className="page-head">
        <p className="lede tight">Structured page copy is stored in the content bucket. Connect the public site to these records when that integration is ready.</p>
        <button type="button" className="btn primary" onClick={() => navigate('/pages/new-page?create=1')}>Add page</button>
      </div>
      {error && <p className="form-error">{error}</p>}
      <section className="suggest">
        {SUGGESTED.map(([slug, label]) => (
          <button key={slug} type="button" className="child-card" onClick={() => navigate(`/pages/${slug}${existing.has(slug) ? '' : '?create=1'}`)}>
            <span>{label}</span>
            <strong>{existing.has(slug) ? 'Edit' : 'Create'}</strong>
          </button>
        ))}
      </section>
      <section className="panel">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Title</th>
                <th>Section</th>
                <th>Status</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pages && pages.length === 0 && <tr><td colSpan="5" className="empty">No website pages yet.</td></tr>}
              {(pages || []).map((page) => (
                <tr key={page.slug}>
                  <td>
                    <Link to={`/pages/${page.slug}`}>{page.title}</Link>
                    <div className="cell-sub">{page.slug}</div>
                  </td>
                  <td>{page.section}</td>
                  <td><span className={`badge ${page.status}`}>{page.status}</span></td>
                  <td>{formatDate(page.updatedAt)}</td>
                  <td>
                    <div className="row-actions tight">
                      <button type="button" className="btn tiny" onClick={() => navigate(`/pages/${page.slug}`)}>Edit</button>
                      <button type="button" className="btn tiny danger" onClick={() => setPending(page)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {pending && (
        <Modal title="Delete page" onClose={() => setPending(null)}>
          <p>Delete <strong>{pending.title}</strong>? This removes the page record from the content bucket.</p>
          <div className="dialog-actions">
            <button type="button" className="btn ghost" onClick={() => setPending(null)}>Keep it</button>
            <button
              type="button"
              className="btn danger"
              onClick={async () => {
                await api(`/api/pages/${pending.slug}`, { method: 'DELETE' })
                setPending(null)
                load()
              }}
            >
              Delete page
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

export function PageEditor() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const create = new URLSearchParams(window.location.search).get('create') === '1'
  const [form, setForm] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState('')

  useEffect(() => {
    let cancel = false
    api(`/api/pages/${slug}`)
      .then((page) => {
        if (!cancel) setForm(page)
      })
      .catch((err) => {
        if (cancel) return
        if (err.status === 404 && (create || slug === 'new-page')) {
          const suggested = SUGGESTED.find((item) => item[0] === slug)
          setForm({
            slug: slug === 'new-page' ? '' : slug,
            title: suggested?.[1] || '',
            section: suggested?.[1] || 'Other',
            excerpt: '',
            body: '',
            status: 'draft',
          })
        } else setError(err.message)
      })
    return () => {
      cancel = true
    }
  }, [slug, create])

  function set(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function onSubmit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setSaved('')
    const target = (form.slug || form.title || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    try {
      const savedPage = await api(`/api/pages/${target}`, {
        method: 'PUT',
        body: JSON.stringify(form),
      })
      setSaved('Page saved.')
      if (savedPage.slug !== slug) navigate(`/pages/${savedPage.slug}`, { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (error && !form) return <p className="form-error">{error}</p>
  if (!form) return <p className="muted">Loading page…</p>

  return (
    <form className="stack editor" onSubmit={onSubmit}>
      <div className="page-head">
        <p className="lede tight">Page copy is stored with the rest of the website content.</p>
        <div className="row-actions">
          <button type="button" className="btn ghost" onClick={() => navigate('/pages')}>Back</button>
          <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save page'}</button>
        </div>
      </div>
      {saved && <p className="notice">{saved}</p>}
      {error && <p className="form-error">{error}</p>}
      <div className="editor-grid">
        <label>
          Title
          <input value={form.title} onChange={(event) => set('title', event.target.value)} required />
        </label>
        <label>
          Section
          <input value={form.section} onChange={(event) => set('section', event.target.value)} required />
        </label>
        <label className="span-2">
          Summary
          <textarea rows="3" value={form.excerpt} onChange={(event) => set('excerpt', event.target.value)} />
        </label>
        <label className="span-2">
          Page content
          <textarea rows="16" value={form.body} onChange={(event) => set('body', event.target.value)} />
        </label>
        <fieldset className="status-set">
          <legend>Status</legend>
          <label><input type="radio" name="status" checked={form.status === 'published'} onChange={() => set('status', 'published')} /> Published</label>
          <label><input type="radio" name="status" checked={form.status === 'draft'} onChange={() => set('status', 'draft')} /> Draft</label>
        </fieldset>
      </div>
    </form>
  )
}
