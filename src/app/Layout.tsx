import { useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Menu, X, LogOut } from 'lucide-react'
import { useAuth } from '../context/AuthProvider'
import './app.css'

interface NavLink {
  to: string
  icon: string
  label: string
}

interface NavSection {
  section: string
  links: NavLink[]
}

const NAV: NavSection[] = [
  {
    section: 'Fiat',
    links: [
      { to: '/app/fiat',           icon: '🕊️', label: 'Fiat Mode'    },
      { to: '/app/dashboard',      icon: '✦',  label: 'Dashboard'    },
      { to: '/app/plan',           icon: '📅', label: 'Weekly Plan'  },
    ],
  },
  {
    section: 'Body',
    links: [
      { to: '/app/meals',          icon: '🥩', label: 'Meals'         },
      { to: '/app/shopping',       icon: '🛒', label: 'Shopping List' },
      { to: '/app/shopping-trips', icon: '🧾', label: 'Trip History'  },
      { to: '/app/pantry',         icon: '🥫', label: 'Pantry'        },
      { to: '/app/inventory',      icon: '📦', label: 'Inventory'     },
      { to: '/app/workouts',       icon: '⚔️', label: 'Workouts'      },
      { to: '/app/macros',         icon: '📊', label: 'My Macros'     },
    ],
  },
  {
    section: 'Catalog',
    links: [
      { to: '/app/ingredients',         icon: '🧂', label: 'Ingredients'         },
      { to: '/app/store-products',      icon: '🏪', label: 'Store Products'      },
      { to: '/app/ingredient-products', icon: '🔗', label: 'Ingredient Products' },
    ],
  },
]

const ADMIN_LINKS: NavLink[] = [
  { to: '/app/admin', icon: '⚙️', label: 'Admin' },
]

const PAGE_TITLES: Record<string, string> = {
  '/app/fiat':                'Fiat Mode',
  '/app/dashboard':           'Dashboard',
  '/app/plan':                'Weekly Plan',
  '/app/meals':               'Meals',
  '/app/shopping':            'Shopping List',
  '/app/shopping-trips':      'Trip History',
  '/app/workouts':            'Workouts',
  '/app/macros':              'My Macros',
  '/app/pantry':              'Pantry',
  '/app/inventory':           'Inventory',
  '/app/account':             'Account',
  '/app/settings':            'Meal Imports',
  '/app/training':            'Training',
  '/app/store-products':      'Store Products',
  '/app/ingredients':         'Ingredients',
  '/app/ingredient-products': 'Ingredient Products',
  '/app/admin':               'Admin',
}

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { signOut, profile } = useAuth()

  const pageTitle = PAGE_TITLES[location.pathname] ?? 'Daily Catholic'

  const handleSignOut = async () => {
    setSidebarOpen(false)
    try {
      await signOut()
    } catch {
      // sign out best-effort
    }
    navigate('/login')
  }

  const today = new Date().toLocaleDateString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  return (
    <div className="app-shell">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
            zIndex: 99,
          }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`app-sidebar${sidebarOpen ? ' open' : ''}`}>
        <Link to="/app/fiat" className="sidebar-brand" onClick={() => setSidebarOpen(false)}>
          <span className="sidebar-brand-icon">✝</span>
          <div>
            <div className="sidebar-brand-text">Daily Catholic</div>
            <div className="sidebar-brand-sub">Fiat Mode</div>
          </div>
        </Link>

        <nav className="sidebar-nav">
          {NAV.map(section => (
            <div key={section.section}>
              <div className="sidebar-section-label">{section.section}</div>
              {section.links.map(link => (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`sidebar-link${location.pathname === link.to ? ' active' : ''}`}
                  onClick={() => setSidebarOpen(false)}
                >
                  <span className="sidebar-link-icon">{link.icon}</span>
                  {link.label}
                </Link>
              ))}
            </div>
          ))}

          {profile?.role === 'admin' && (
            <div>
              <div className="sidebar-section-label">Admin</div>
              {ADMIN_LINKS.map(link => (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`sidebar-link${location.pathname === link.to ? ' active' : ''}`}
                  onClick={() => setSidebarOpen(false)}
                >
                  <span className="sidebar-link-icon">{link.icon}</span>
                  {link.label}
                </Link>
              ))}
            </div>
          )}
        </nav>

        <div className="sidebar-footer">
          <Link
            to="/app/account"
            className={`sidebar-link${location.pathname === '/app/account' ? ' active' : ''}`}
            onClick={() => setSidebarOpen(false)}
          >
            <span className="sidebar-link-icon">👤</span>
            Account
          </Link>
          <Link
            to="/app/settings"
            className={`sidebar-link${location.pathname === '/app/settings' ? ' active' : ''}`}
            onClick={() => setSidebarOpen(false)}
          >
            <span className="sidebar-link-icon">⚙️</span>
            Settings
          </Link>
          <Link to="/" className="sidebar-link" style={{ marginBottom: '0.25rem' }} onClick={() => setSidebarOpen(false)}>
            <span className="sidebar-link-icon">🌐</span>
            Public Site
          </Link>
          <button
            onClick={handleSignOut}
            className="sidebar-link"
            style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
          >
            <span className="sidebar-link-icon"><LogOut size={15} /></span>
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="app-main">
        <header className="app-topbar">
          <button
            className="btn-app-ghost mobile-menu-btn"
            style={{ padding: '0.375rem' }}
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Toggle menu"
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <h1 className="topbar-title">{pageTitle}</h1>
          <span className="topbar-date">{today}</span>
        </header>

        <div className="app-content">
          <Outlet />
        </div>
      </div>

      <style>{`
        .mobile-menu-btn { display: none; }
        @media (max-width: 768px) {
          .app-sidebar { transform: translateX(-100%); }
          .app-sidebar.open { transform: translateX(0); }
          .mobile-menu-btn { display: inline-flex !important; }
        }
      `}</style>
    </div>
  )
}
