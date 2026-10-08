import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from './api'
import { useAuth } from './auth'
import { trailFor } from './format'

function Mark() {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#12375f" />
      <circle cx="12" cy="13" r="3.2" fill="#f7f9fc" />
      <circle cx="20.6" cy="12" r="2.2" fill="#8fb4e3" />
      <circle cx="16.4" cy="20.2" r="2.6" fill="#d5e4f6" />
    </svg>
  )
}

function nodeKey(node) {
  return node.prefix || node.route || node.slug
}

function NavTree({ nodes, depth, prefix, pathname, openMap, setOpenMap, onNavigate }) {
  return (
    <div className={depth ? 'nav-children' : 'nav-root'}>
      {nodes.map((node) => {
        const key = nodeKey(node)
        const children = node.children || []
        const current = node.route ? pathname === node.route : Boolean(node.prefix && prefix === node.prefix)
        const childActive = children.some((child) => contains(child, prefix, pathname))
        const open = openMap[key] ?? (depth === 0 || childActive || current)
        return (
          <div key={key}>
            <div className={current ? 'nav-row active' : 'nav-row'}>
              {children.length > 0 ? (
                <button
                  type="button"
                  className={open ? 'chevron open' : 'chevron'}
                  aria-label={open ? `Collapse ${node.name}` : `Expand ${node.name}`}
                  onClick={() => setOpenMap((state) => ({ ...state, [key]: !open }))}
                >
                  <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M4 2.5 8 6 4 9.5" /></svg>
                </button>
              ) : <span className="chevron spacer" />}
              <button
                type="button"
                className="nav-link"
                onClick={() => {
                  if (node.route) onNavigate(node.route)
                  else if (node.prefix) onNavigate(`/documents?prefix=${encodeURIComponent(node.prefix)}`)
                  else setOpenMap((state) => ({ ...state, [key]: !open }))
                }}
              >
                <span>{node.name}</span>
                <small>{node.count || 0}</small>
              </button>
            </div>
            {children.length > 0 && open && (
              <NavTree
                nodes={children}
                depth={depth + 1}
                prefix={prefix}
                pathname={pathname}
                openMap={openMap}
                setOpenMap={setOpenMap}
                onNavigate={onNavigate}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

function contains(node, prefix, pathname) {
  if (node.route && pathname === node.route) return true
  if (node.prefix && prefix.startsWith(node.prefix)) return true
  return (node.children || []).some((child) => contains(child, prefix, pathname))
}

export default function Shell() {
  const { user, logout } = useAuth()
  const [tree, setTree] = useState(null)
  const [navError, setNavError] = useState('')
  const [openMap, setOpenMap] = useState({})
  const [mobileOpen, setMobileOpen] = useState(false)
  const [params] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const prefix = params.get('prefix') || ''
  const [query, setQuery] = useState(params.get('q') || '')

  function reloadNav() {
    return api('/api/navigation')
      .then((data) => {
        setTree(data.tree)
        setNavError('')
      })
      .catch((error) => setNavError(error.message))
  }

  useEffect(() => {
    reloadNav()
  }, [])

  useEffect(() => {
    if (location.pathname.startsWith('/documents')) setQuery(params.get('q') || '')
  }, [location.pathname, params])

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname, prefix])

  const trail = location.pathname.startsWith('/pages')
    ? [{ name: 'Website' }, { name: location.pathname === '/pages' ? 'Pages' : 'Edit page' }]
    : trailFor(tree, prefix)
  const title = location.pathname === '/'
    ? 'Overview'
    : location.pathname === '/pages'
      ? 'Website pages'
      : location.pathname.startsWith('/pages/')
        ? 'Edit page'
        : (trail.at(-1)?.name || 'All documents')

  const crumbs = [{ name: 'Dashboard', to: '/' }]
  if (location.pathname.startsWith('/documents')) {
    if (!trail.length) crumbs.push({ name: 'All documents' })
    trail.forEach((node) => {
      crumbs.push({
        name: node.name,
        to: node.prefix ? `/documents?prefix=${encodeURIComponent(node.prefix)}` : undefined,
      })
    })
  } else if (location.pathname.startsWith('/pages')) {
    crumbs.push({ name: 'Website pages', to: '/pages' })
    if (location.pathname !== '/pages') crumbs.push({ name: 'Edit page' })
  }

  return (
    <div className="app">
      <aside className={mobileOpen ? 'sidebar open' : 'sidebar'}>
        <button type="button" className="brand" onClick={() => navigate('/')}>
          <Mark />
          <span>
            <strong>Granules</strong>
            <em>Content studio</em>
          </span>
        </button>
        <nav className="side-nav" aria-label="CMS modules">
          <NavLink to="/" end className="dash-link">Overview</NavLink>
          {navError && <p className="nav-error">{navError}</p>}
          {tree && (
            <NavTree
              nodes={tree}
              depth={0}
              prefix={prefix}
              pathname={location.pathname}
              openMap={openMap}
              setOpenMap={setOpenMap}
              onNavigate={navigate}
            />
          )}
        </nav>
        <div className="side-foot">
          <span>Private document library</span>
        </div>
      </aside>
      {mobileOpen && <button type="button" className="backdrop" aria-label="Close menu" onClick={() => setMobileOpen(false)} />}
      <div className="workspace">
        <header className="topbar">
          <div className="topbar-title">
            <button type="button" className="menu-btn" onClick={() => setMobileOpen(true)} aria-label="Open menu">
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14" /></svg>
            </button>
            <div>
              <nav className="crumbs" aria-label="Breadcrumb">
                {crumbs.map((crumb, index) => (
                  <span key={`${crumb.name}-${index}`}>
                    {index > 0 && <span className="sep">/</span>}
                    {crumb.to && index < crumbs.length - 1 ? <button type="button" onClick={() => navigate(crumb.to)}>{crumb.name}</button> : <span>{crumb.name}</span>}
                  </span>
                ))}
              </nav>
              <h1>{title}</h1>
            </div>
          </div>
          <form
            className="global-search"
            onSubmit={(event) => {
              event.preventDefault()
              navigate(`/documents?q=${encodeURIComponent(query.trim())}`)
            }}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" /><path d="M12.5 12.5 17 17" /></svg>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search documents"
              aria-label="Search documents"
            />
          </form>
          <div className="profile">
            <span className="avatar">A</span>
            <span className="who">
              <strong>{user?.name || 'Administrator'}</strong>
              <small>{user?.email}</small>
            </span>
            <button type="button" className="btn ghost" onClick={logout}>Sign out</button>
          </div>
        </header>
        <main className="content">
          <Outlet context={{ tree: tree || [], reloadNav }} />
        </main>
      </div>
    </div>
  )
}
