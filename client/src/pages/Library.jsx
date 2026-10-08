import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { KIND_LABEL, destinations, formatBytes, formatDate, placement } from '../format'
import { Drawer, Modal } from '../ui'

const emptyForm = {
  title: '',
  description: '',
  folderPrefix: '',
  year: '',
  publicationDate: '',
  status: 'published',
  file: null,
}

export default function Library() {
  const { tree, reloadNav } = useOutletContext()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const prefix = params.get('prefix') || ''
  const q = params.get('q') || ''
  const year = params.get('year') || ''
  const status = params.get('status') || ''
  const type = params.get('type') || ''
  const page = Number(params.get('page') || 1)
  const doc = params.get('doc') || ''
  const compose = params.get('compose') === '1'
  const [search, setSearch] = useState(q)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [editor, setEditor] = useState(null)
  const [preview, setPreview] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [syncing, setSyncing] = useState(false)

  function update(patch) {
    setParams((current) => {
      const next = new URLSearchParams(current)
      Object.entries(patch).forEach(([key, value]) => {
        if (!value) next.delete(key)
        else next.set(key, String(value))
      })
      return next
    })
  }

  useEffect(() => {
    setSearch(q)
  }, [q])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (search !== q) update({ q: search.trim(), page: '' })
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    const query = new URLSearchParams()
    if (prefix) query.set('prefix', prefix)
    if (q) query.set('q', q)
    if (year) query.set('year', year)
    if (status) query.set('status', status)
    if (type) query.set('type', type)
    query.set('page', String(page || 1))
    let cancel = false
    setLoading(true)
    api(`/api/content?${query.toString()}`)
      .then((result) => {
        if (!cancel) {
          setData(result)
          setError('')
        }
      })
      .catch((err) => {
        if (!cancel) setError(err.message)
      })
      .finally(() => {
        if (!cancel) setLoading(false)
      })
    return () => {
      cancel = true
    }
  }, [prefix, q, year, status, type, page])

  useEffect(() => {
    if (!notice) return undefined
    const timer = setTimeout(() => setNotice(''), 3200)
    return () => clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    if (compose) {
      setEditor({ mode: 'create', form: { ...emptyForm, folderPrefix: prefix, publicationDate: new Date().toISOString().slice(0, 10) } })
    }
  }, [compose, prefix])

  useEffect(() => {
    if (!doc || !data) return
    const item = data.items.find((entry) => entry.id === doc)
    if (item) openPreview(item)
  }, [doc, data])

  const folders = useMemo(() => destinations(tree), [tree])
  const place = placement(tree, prefix)
  const childCards = useMemo(() => {
    if (!prefix) return tree
    function find(nodes) {
      for (const node of nodes || []) {
        if (node.prefix === prefix) return node.children || []
        const found = find(node.children)
        if (found) return found
      }
      return null
    }
    return find(tree) || []
  }, [tree, prefix])

  function closeEditor() {
    setEditor(null)
    if (compose) update({ compose: '' })
  }

  async function openPreview(item) {
    setPreview(item)
    setPreviewUrl(null)
    try {
      const result = await api(`/api/content/${item.id}/url`)
      setPreviewUrl(result)
    } catch (err) {
      setError(err.message)
    }
  }

  function closePreview() {
    setPreview(null)
    setPreviewUrl(null)
    if (doc) update({ doc: '' })
  }

  async function download(item) {
    const result = await api(`/api/content/${item.id}/url?disposition=attachment`)
    window.open(result.url, '_blank', 'noopener')
  }

  async function sync() {
    setSyncing(true)
    try {
      await api('/api/sync', { method: 'POST' })
      await reloadNav()
      update({ page: '' })
      setNotice('Storage catalogue refreshed.')
    } catch (err) {
      setError(err.message)
    } finally {
      setSyncing(false)
    }
  }

  const start = data && data.total ? (data.page - 1) * data.pageSize + 1 : 0
  const end = data ? Math.min(data.total, data.page * data.pageSize) : 0

  return (
    <div className="stack">
      <div className="page-head">
        <p className="lede tight">
          {prefix
            ? `${place.module}${place.category !== place.module ? ` / ${place.category}` : ''}${place.subcategory !== '—' ? ` / ${place.subcategory}` : ''}`
            : 'Every document currently stored for the public website.'}
        </p>
        <div className="row-actions">
          <button type="button" className="btn ghost" onClick={sync} disabled={syncing}>{syncing ? 'Syncing…' : 'Sync'}</button>
          <button type="button" className="btn ghost" onClick={() => setCategoryOpen(true)}>{prefix ? 'Add category' : 'Add module'}</button>
          <button
            type="button"
            className="btn primary"
            onClick={() => setEditor({
              mode: 'create',
              form: { ...emptyForm, folderPrefix: prefix, publicationDate: new Date().toISOString().slice(0, 10) },
            })}
          >
            Add document
          </button>
        </div>
      </div>
      {notice && <p className="notice" role="status">{notice}</p>}
      {error && <p className="form-error">{error}</p>}
      {!!childCards.length && (
        <div className="child-row">
          {childCards.filter((child) => child.prefix || child.route || child.children?.length).map((child) => (
            <button
              key={child.prefix || child.route || child.slug}
              type="button"
              className="child-card"
              onClick={() => {
                if (child.route) navigate(child.route)
                else if (child.prefix) update({ prefix: child.prefix, page: '', q: '', year: '', status: '', type: '' })
                else navigate('/pages')
              }}
            >
              <span>{child.name}</span>
              <strong>{child.count || 0}</strong>
            </button>
          ))}
        </div>
      )}
      <div className="toolbar">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Filter by title or file name"
          aria-label="Filter documents"
        />
        <select value={year} onChange={(event) => update({ year: event.target.value, page: '' })} aria-label="Year">
          <option value="">All years</option>
          {(data?.facets.years || []).map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select value={status} onChange={(event) => update({ status: event.target.value, page: '' })} aria-label="Status">
          <option value="">Any status</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
        </select>
        <select value={type} onChange={(event) => update({ type: event.target.value, page: '' })} aria-label="Content type">
          <option value="">Any type</option>
          {(data?.facets.types || []).map((item) => <option key={item} value={item}>{KIND_LABEL[item] || item}</option>)}
        </select>
      </div>
      <section className="panel">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Title</th>
                <th>Category</th>
                <th>Subcategory</th>
                <th>Type</th>
                <th>Published</th>
                <th>Updated</th>
                <th>Status</th>
                <th className="sticky">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan="8" className="empty">Loading documents…</td></tr>
              )}
              {!loading && data?.items.length === 0 && (
                <tr><td colSpan="8" className="empty">No documents match this view.</td></tr>
              )}
              {!loading && data?.items.map((item) => {
                const where = placement(tree, item.folderPrefix)
                return (
                  <tr key={item.id}>
                    <td>
                      <button type="button" className="linkish" onClick={() => openPreview(item)}>{item.title}</button>
                      <div className="cell-sub">{item.filename}</div>
                    </td>
                    <td>{where.category}</td>
                    <td>{where.subcategory}</td>
                    <td>
                      <div>{KIND_LABEL[item.kind] || item.kind}</div>
                      <div className="cell-sub">{formatBytes(item.size)}</div>
                    </td>
                    <td>
                      <div>{formatDate(item.publicationDate)}</div>
                      {item.year && <div className="cell-sub">{item.year}</div>}
                    </td>
                    <td>{formatDate(item.updatedAt)}</td>
                    <td><span className={`badge ${item.status}`}>{item.status}</span></td>
                    <td className="sticky">
                      <div className="row-actions tight">
                        <button type="button" className="btn tiny" onClick={() => openPreview(item)}>Preview</button>
                        <button type="button" className="btn tiny" onClick={() => setEditor({ mode: 'edit', form: { ...item, file: null } })}>Edit</button>
                        <button type="button" className="btn tiny danger" onClick={() => setPendingDelete(item)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {data && data.total > 0 && (
          <div className="pager">
            <span>Showing {start}–{end} of {data.total}</span>
            <div className="row-actions">
              <button type="button" className="btn tiny" disabled={data.page <= 1} onClick={() => update({ page: data.page - 1 })}>Previous</button>
              <button type="button" className="btn tiny" disabled={data.page * data.pageSize >= data.total} onClick={() => update({ page: data.page + 1 })}>Next</button>
            </div>
          </div>
        )}
      </section>
      {editor && (
        <DocumentForm
          mode={editor.mode}
          initial={editor.form}
          folders={folders}
          years={data?.facets.years || []}
          onClose={closeEditor}
          onSaved={(message) => {
            closeEditor()
            setNotice(message)
            update({ page: page > 1 ? page : '' })
            reloadNav()
          }}
        />
      )}
      {preview && (
        <Modal title={preview.title} onClose={closePreview} wide>
          <div className="preview-meta">
            <span className={`badge ${preview.status}`}>{preview.status}</span>
            <span>{preview.filename}</span>
            <span>{formatBytes(preview.size)}</span>
            <span>{formatDate(preview.publicationDate)}</span>
          </div>
          {preview.description && <p className="preview-copy">{preview.description}</p>}
          <div className="preview-frame">
            {!previewUrl && <p className="muted">Preparing the file…</p>}
            {previewUrl?.kind === 'pdf' && <iframe title={preview.title} src={previewUrl.url} />}
            {previewUrl?.kind === 'image' && <img src={previewUrl.url} alt={preview.title} />}
            {previewUrl?.kind === 'audio' && <audio controls src={previewUrl.url} />}
            {previewUrl?.kind === 'video' && <video controls src={previewUrl.url} />}
            {previewUrl && !['pdf', 'image', 'audio', 'video'].includes(previewUrl.kind) && (
              <p>This file opens best as a download.</p>
            )}
          </div>
          <div className="dialog-actions">
            {previewUrl && <a className="btn ghost" href={previewUrl.url} target="_blank" rel="noreferrer">Open</a>}
            <button type="button" className="btn ghost" onClick={() => download(preview)}>Download</button>
            <button type="button" className="btn primary" onClick={() => { closePreview(); setEditor({ mode: 'edit', form: { ...preview, file: null } }) }}>Edit</button>
          </div>
        </Modal>
      )}
      {pendingDelete && (
        <ConfirmDelete
          item={pendingDelete}
          onClose={() => setPendingDelete(null)}
          onDeleted={() => {
            setPendingDelete(null)
            setNotice('Document deleted.')
            update({ page: '' })
            reloadNav()
          }}
        />
      )}
      {categoryOpen && (
        <CategoryDialog
          parentPrefix={prefix}
          onClose={() => setCategoryOpen(false)}
          onCreated={async (name) => {
            setCategoryOpen(false)
            await reloadNav()
            setNotice(`${name} is ready for documents.`)
          }}
        />
      )}
    </div>
  )
}

function DocumentForm({ mode, initial, folders, years, onClose, onSaved }) {
  const [form, setForm] = useState(initial)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function set(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function onSubmit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const body = new FormData()
      body.set('title', form.title)
      body.set('description', form.description || '')
      body.set('folderPrefix', form.folderPrefix)
      body.set('year', form.year || '')
      body.set('publicationDate', form.publicationDate || '')
      body.set('status', form.status)
      if (form.file) body.set('file', form.file)
      if (mode === 'create') {
        await api('/api/content', { method: 'POST', body })
      } else {
        await api(`/api/content/${initial.id}`, { method: 'PUT', body })
      }
      onSaved(mode === 'create' ? 'Document added.' : 'Document updated.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Drawer title={mode === 'create' ? 'Add document' : 'Edit document'} onClose={onClose}>
      <form className="stack form" onSubmit={onSubmit}>
        <label>
          Title
          <input value={form.title} onChange={(event) => set('title', event.target.value)} required />
        </label>
        <label>
          Description
          <textarea rows="4" value={form.description || ''} onChange={(event) => set('description', event.target.value)} />
        </label>
        <label>
          Category
          <select value={form.folderPrefix} onChange={(event) => set('folderPrefix', event.target.value)} required>
            <option value="">Select a folder</option>
            {folders.map((folder) => <option key={folder.prefix} value={folder.prefix}>{folder.label}</option>)}
          </select>
        </label>
        <div className="split">
          <label>
            Year or period
            <input list="years" value={form.year || ''} onChange={(event) => set('year', event.target.value)} placeholder="2026 or FY25-26" />
            <datalist id="years">
              {years.map((item) => <option key={item} value={item} />)}
            </datalist>
          </label>
          <label>
            Publication date
            <input type="date" value={(form.publicationDate || '').slice(0, 10)} onChange={(event) => set('publicationDate', event.target.value)} />
          </label>
        </div>
        <fieldset className="status-set">
          <legend>Status</legend>
          <label><input type="radio" name="status" checked={form.status === 'published'} onChange={() => set('status', 'published')} /> Published</label>
          <label><input type="radio" name="status" checked={form.status === 'draft'} onChange={() => set('status', 'draft')} /> Draft</label>
        </fieldset>
        <label className="drop">
          <input
            type="file"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.webp,.gif,.mp3,.wav,.mp4,.zip"
            onChange={(event) => set('file', event.target.files?.[0] || null)}
          />
          <span>{form.file ? form.file.name : mode === 'edit' ? `Replace file (${initial.filename})` : 'Choose a PDF or media file'}</span>
          <small>PDF files are checked before they are stored. Maximum size 50 MB.</small>
        </label>
        {mode === 'edit' && <p className="mono path">{initial.key}</p>}
        {error && <p className="form-error">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Saving…' : mode === 'create' ? 'Save document' : 'Save changes'}</button>
        </div>
      </form>
    </Drawer>
  )
}

function ConfirmDelete({ item, onClose, onDeleted }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function confirm() {
    setBusy(true)
    try {
      await api(`/api/content/${item.id}`, { method: 'DELETE' })
      onDeleted()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <Modal title="Delete document" onClose={onClose}>
      <p>Delete <strong>{item.title}</strong>? The file is removed from storage and will no longer be available to the website.</p>
      {error && <p className="form-error">{error}</p>}
      <div className="dialog-actions">
        <button type="button" className="btn ghost" onClick={onClose}>Keep it</button>
        <button type="button" className="btn danger" onClick={confirm} disabled={busy}>{busy ? 'Deleting…' : 'Delete document'}</button>
      </div>
    </Modal>
  )
}

function CategoryDialog({ parentPrefix, onClose, onCreated }) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const created = await api('/api/navigation', {
        method: 'POST',
        body: JSON.stringify({ parentPrefix, name }),
      })
      onCreated(created.name)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <Modal title={parentPrefix ? 'Add category' : 'Add module'} onClose={onClose}>
      <form className="stack form" onSubmit={onSubmit}>
        <label>
          Name
          <input value={name} onChange={(event) => setName(event.target.value)} autoFocus required />
        </label>
        <p className="muted">The folder is created when the first document is published into it.</p>
        {error && <p className="form-error">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy}>{busy ? 'Adding…' : 'Add'}</button>
        </div>
      </form>
    </Modal>
  )
}
