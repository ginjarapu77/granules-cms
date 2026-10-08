import { useEffect, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { api } from '../api'
import { formatDate, placement } from '../format'

export default function Dashboard() {
  const { tree } = useOutletContext()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [syncing, setSyncing] = useState(false)

  function load() {
    return api('/api/dashboard').then(setData).catch((err) => setError(err.message))
  }

  useEffect(() => {
    load()
  }, [])

  async function sync() {
    setSyncing(true)
    setError('')
    try {
      await api('/api/sync', { method: 'POST' })
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSyncing(false)
    }
  }

  if (!data && !error) return <p className="muted">Loading the catalogue…</p>
  if (!data) return <p className="form-error">{error}</p>

  return (
    <div className="stack">
      <div className="page-head">
        <p className="lede tight">
          Documents in <span className="mono">{data.bucket}</span>, {data.region}. Published files stay in the website folders. Drafts stay in the CMS area until you publish them.
        </p>
        <div className="row-actions">
          <button type="button" className="btn ghost" onClick={sync} disabled={syncing}>{syncing ? 'Syncing…' : 'Sync from storage'}</button>
          <button type="button" className="btn primary" onClick={() => navigate('/documents?compose=1')}>Add document</button>
        </div>
      </div>
      {error && <p className="form-error">{error}</p>}
      <section className="stats">
        <article>
          <span>Documents</span>
          <strong>{data.documents}</strong>
        </article>
        <article>
          <span>Published</span>
          <strong>{data.published}</strong>
        </article>
        <article>
          <span>Drafts</span>
          <strong>{data.drafts}</strong>
        </article>
        <article>
          <span>Website pages</span>
          <strong>{data.pages}</strong>
        </article>
      </section>
      <section className="module-grid">
        {(tree || []).map((module) => (
          <button
            type="button"
            key={module.slug}
            className="module-card"
            onClick={() => {
              if (module.prefix) navigate(`/documents?prefix=${encodeURIComponent(module.prefix)}`)
              else navigate('/pages')
            }}
          >
            <span>{module.name}</span>
            <strong>{module.count || 0}</strong>
            <small>{module.prefix ? 'Open the library' : 'Open website pages'}</small>
          </button>
        ))}
      </section>
      <section className="panel">
        <header className="panel-head">
          <h2>Recently updated</h2>
        </header>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Title</th>
                <th>Category</th>
                <th>Status</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {data.recent.map((item) => {
                const place = placement(tree, item.folderPrefix)
                return (
                  <tr key={item.id} onClick={() => navigate(`/documents?prefix=${encodeURIComponent(item.folderPrefix || '')}&doc=${item.id}`)}>
                    <td>
                      <div className="cell-title">{item.title}</div>
                      <div className="cell-sub">{item.filename}</div>
                    </td>
                    <td>{place.category}{place.subcategory !== '—' ? ` / ${place.subcategory}` : ''}</td>
                    <td><span className={`badge ${item.status}`}>{item.status}</span></td>
                    <td>{formatDate(item.updatedAt)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
