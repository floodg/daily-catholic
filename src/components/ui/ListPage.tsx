import { useState, useEffect } from 'react'
import { Search, Plus, X } from 'lucide-react'

export type PanelMode = 'view' | 'edit' | 'new' | null

export interface ListItem {
  id: string
  name: string
}

interface ListPageProps<T extends ListItem> {
  eyebrow?: string
  /** Supports raw HTML — use <em> for italic accent */
  title: string
  items: T[]
  renderListItem: (item: T, isSelected: boolean, onSelect: (item: T) => void) => React.ReactNode
  renderDetail: (
    item: T | null,
    onClose: () => void,
    mode: PanelMode,
    setMode: (mode: PanelMode) => void,
  ) => React.ReactNode
  searchPlaceholder?: string
  searchFilter?: (item: T, query: string) => boolean
  /** Hide the Add button for read-only lists */
  showAddButton?: boolean
  /** Keep the sidebar/detail two-column layout even when detail panel is closed */
  alwaysTwoColumn?: boolean
  /** What to render in the detail column when `panelOpen` is false */
  emptyDetail?: React.ReactNode
  addLabel?: string
  emptyIcon?: string
  emptyText?: string
  /** Pre-select an item and open the panel in the given mode on first render */
  defaultSelected?: T | null
  defaultMode?: PanelMode
  /** Called whenever selection or panel mode changes so the parent can persist state */
  onStateChange?: (selected: T | null, mode: PanelMode) => void
}

export default function ListPage<T extends ListItem>({
  eyebrow,
  title,
  items,
  renderListItem,
  renderDetail,
  searchPlaceholder = 'Search…',
  searchFilter,
  showAddButton = true,
  alwaysTwoColumn = false,
  emptyDetail,
  addLabel = 'Add New',
  emptyIcon = '📋',
  emptyText = 'No items yet',
  defaultSelected = null,
  defaultMode = null,
  onStateChange,
}: ListPageProps<T>) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<T | null>(defaultSelected)
  const [panelMode, setPanelMode] = useState<PanelMode>(defaultSelected ? (defaultMode ?? 'view') : null)

  useEffect(() => {
    onStateChange?.(selected, panelMode)
  }, [selected, panelMode]) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = searchFilter && query.trim()
    ? items.filter(item => searchFilter(item, query.trim()))
    : items

  const handleSelect = (item: T) => {
    setSelected(item)
    setPanelMode('view')
  }

  const handleAddNew = () => {
    setSelected(null)
    setPanelMode('new')
  }

  const handleClose = () => {
    setSelected(null)
    setPanelMode(null)
  }

  const panelOpen = panelMode !== null

  return (
    <div>
      {/* Header */}
      <div className="page-header-bar">
        <div>
          {eyebrow && <p className="page-eyebrow">{eyebrow}</p>}
          {/* Safe: title is controlled by us, not user input */}
          <h1 className="page-title" dangerouslySetInnerHTML={{ __html: title }} />
        </div>
        {showAddButton && (
          <button className="btn-app-primary" onClick={handleAddNew}>
            <Plus size={16} />
            {addLabel}
          </button>
        )}
      </div>

      {/* Two-column layout */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: (alwaysTwoColumn || panelOpen) ? '320px 1fr' : '1fr',
        gap: '1.25rem',
        alignItems: 'start',
        transition: 'grid-template-columns 0.25s ease',
      }}>
        {/* List column */}
        <div>
          <div style={{ position: 'relative', marginBottom: '0.875rem' }}>
            <Search size={15} style={{
              position: 'absolute', left: '0.75rem', top: '50%',
              transform: 'translateY(-50%)', color: 'var(--text-subtle)', pointerEvents: 'none',
            }} />
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="app-input"
              style={{ paddingLeft: '2.25rem' }}
            />
          </div>

          <div style={{
            fontSize: '0.7rem', color: 'var(--text-subtle)',
            fontFamily: 'DM Sans, sans-serif', marginBottom: '0.625rem', letterSpacing: '0.05em',
          }}>
            {filtered.length} {filtered.length === 1 ? 'item' : 'items'}
            {query ? ` matching "${query}"` : ''}
          </div>

          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)', fontFamily: 'DM Sans, sans-serif' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem', opacity: 0.5 }}>{emptyIcon}</div>
              <p style={{ fontSize: '0.9rem', margin: 0 }}>
                {query ? `No results for "${query}"` : emptyText}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {filtered.map(item =>
                renderListItem(item, selected?.id === item.id && panelMode !== 'new', handleSelect)
              )}
            </div>
          )}
        </div>

        {/* Detail panel */}
        {panelOpen ? (
          <div className="app-card" style={{ position: 'sticky', top: '72px' }}>
            <div style={{
              padding: '1rem 1.25rem 0.75rem',
              borderBottom: '1px solid var(--app-border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{
                fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em',
                textTransform: 'uppercase', color: 'var(--text-subtle)', fontFamily: 'DM Sans, sans-serif',
              }}>
                {panelMode === 'new' ? 'New Item' : (selected?.name ?? 'Details')}
              </span>
              <button className="btn-app-ghost" onClick={handleClose} style={{ padding: '0.25rem' }}>
                <X size={16} />
              </button>
            </div>
            <div style={{ padding: '1.25rem', maxHeight: 'calc(100vh - 160px)', overflowY: 'auto' }}>
              {renderDetail(panelMode === 'new' ? null : selected, handleClose, panelMode, setPanelMode)}
            </div>
          </div>
        ) : alwaysTwoColumn ? (
          <div className="app-card" style={{ position: 'sticky', top: '72px', padding: '1.5rem 1.25rem', textAlign: 'center' }}>
            {emptyDetail ?? (
              <p style={{
                margin: 0,
                fontFamily: 'DM Sans, sans-serif',
                color: 'var(--text-muted)',
                fontSize: '0.9rem',
              }}>
                Select an item to view details.
              </p>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
