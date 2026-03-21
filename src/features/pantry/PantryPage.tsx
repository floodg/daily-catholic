import { useEffect, useMemo, useState } from 'react';
import { addStockByPacks, addStockDirect, getPantryItems, setAutoReorder, type PantryItem, type PurchaseBreakdown } from './api';
import { getLinkedProductsForIngredients, type LinkedProduct } from '../product-linking/api';
import type { MeasurementUnitCode } from '../../domain/types';

function daysSince(dateStr?: string): string {
  if (!dateStr) return 'never';
  const d = new Date(dateStr);
  const today = new Date();
  const ms = today.getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

function formatTripDate(tripDate: string): string {
  const d = new Date(tripDate);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatPurchaseBreakdown(b: PurchaseBreakdown): string {
  return `${b.quantity}${b.product_name ? ` ${b.product_name}` : ''} from ${b.store} ${formatTripDate(b.trip_date)}`;
}

type Unit = MeasurementUnitCode;

interface AddStockModalProps {
  ingredientName?: string;
  onClose: () => void;
  onAdded: () => void;
}

function AddStockModal({ ingredientName, onClose, onAdded }: AddStockModalProps) {
  const [name, setName] = useState(ingredientName ?? '');
  const [packs, setPacks] = useState<number>(1);
  const [directQty, setDirectQty] = useState<number>(0);
  const [directUnit, setDirectUnit] = useState<Unit>('g');
  const [link, setLink] = useState<LinkedProduct | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function loadLink() {
      if (!name.trim()) { setLink(null); return; }
      try {
        const map = await getLinkedProductsForIngredients([name.trim()]);
        if (!active) return;
        const found = map.get(name.trim().toLowerCase()) ?? null;
        setLink(found ?? null);
      } catch {
        if (active) setLink(null);
      }
    }
    loadLink();
    return () => { active = false; };
  }, [name]);

  const packSizeLabel = useMemo(() => {
    if (!link) return null;
    if (link.packSizeG) return `${link.packSizeG} g`;
    if (link.packSizeMl) return `${link.packSizeMl} ml`;
    if (link.packSizeUnits) return `${link.packSizeUnits} units`;
    return null;
  }, [link]);

  const handleAdd = async () => {
    if (!name.trim()) { setError('Ingredient name is required.'); return; }
    setError('');
    setLoading(true);
    try {
      if (link && packs > 0) {
        await addStockByPacks(name.trim(), packs);
      } else {
        if (!(directQty > 0)) { setError('Enter a quantity greater than zero.'); setLoading(false); return; }
        await addStockDirect(name.trim(), directUnit, directQty);
      }
      onAdded();
      onClose();
    } catch (err) {
      console.error(err);
      setError((err as Error)?.message || 'Failed to add stock.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Add Stock</h2>
        {error && <p className="form-error">{error}</p>}
        <div className="form-group">
          <label className="app-label">Ingredient</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Mozzarella"
            className="app-input"
            autoFocus
          />
        </div>

        {link ? (
          <>
            <p className="help-text">
              Linked product: <strong>{link.productName}</strong>{' '}
              {packSizeLabel ? <span>({packSizeLabel} per pack)</span> : null}
            </p>
            <div className="form-group">
              <label className="app-label">How many packs did you buy?</label>
              <input
                type="number"
                min={1}
                step={1}
                value={packs}
                onChange={e => setPacks(parseInt(e.target.value || '0', 10))}
                className="app-input"
              />
            </div>
          </>
        ) : (
          <>
            <p className="help-text">
              No linked product found. Enter quantity directly.
            </p>
            <div className="form-row">
              <div className="form-group">
                <label className="app-label">Quantity</label>
                <input
                  type="number"
                  min={0.01}
                  step={0.01}
                  value={directQty}
                  onChange={e => setDirectQty(parseFloat(e.target.value))}
                  className="app-input"
                />
              </div>
              <div className="form-group">
                <label className="app-label">Unit</label>
                <select value={directUnit} onChange={e => setDirectUnit(e.target.value as Unit)} className="app-input">
                  <option value="g">g</option>
                  <option value="ml">ml</option>
                  <option value="units">units</option>
                </select>
              </div>
            </div>
          </>
        )}

        <div className="modal-actions">
          <button className="btn-app-primary" onClick={handleAdd} disabled={loading}>
            {loading ? 'Adding…' : 'Add Stock'}
          </button>
          <button className="btn-app-ghost" onClick={onClose} disabled={loading}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

export default function PantryPage() {
  const [items, setItems] = useState<PantryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [addingFor, setAddingFor] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await getPantryItems();
      setItems(Array.isArray(rows) ? rows : []);
    } catch (err) {
      console.error(err);
      const msg = (err as Error)?.message;
      setError(msg === 'Not authenticated' ? msg : 'Failed to load pantry.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleToggle = async (item: PantryItem) => {
    try {
      await setAutoReorder(item.ingredientName, item.unit, !item.autoReorder);
      setItems(prev => prev.map(i => (i.id === item.id ? { ...i, autoReorder: !i.autoReorder } : i)));
    } catch (err) {
      console.error(err);
    }
  };

  const hasItems = items.length > 0;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div className="page-header-bar">
        <div>
          <div className="page-eyebrow">Stock on hand</div>
          <h1 className="page-title">🥫 Pantry</h1>
        </div>
        <button className="btn-app-primary" onClick={() => setAddingFor('')}>
          + Add Stock
        </button>
      </div>

      {loading ? (
        <div className="app-card" style={{ padding: '1.25rem' }}>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontFamily: 'DM Sans, sans-serif' }}>Loading…</p>
        </div>
      ) : error ? (
        <div className="app-card" style={{ padding: '1.25rem', borderColor: 'rgba(220,38,38,0.25)', background: 'rgba(220,38,38,0.08)' }}>
          <p style={{ margin: 0, color: '#b91c1c', fontFamily: 'DM Sans, sans-serif', fontWeight: 600 }}>
            {error}
          </p>
        </div>
      ) : !hasItems ? (
        <div className="app-card" style={{ padding: '3rem 2rem', textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🥫</div>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontFamily: 'DM Sans, sans-serif', fontSize: '0.95rem' }}>
            Add your first item (or link a product) to start tracking stock.
          </p>
          <div style={{ marginTop: '1rem' }}>
            <button className="btn-app-primary" onClick={() => setAddingFor('')}>
              + Add Stock
            </button>
          </div>
        </div>
      ) : (
        <div className="pantry-grid">
          {items.map(item => {
            const remaining = Math.max(0, item.remainingQty);
            const totalPurchased = Math.max(0, item.totalPurchased);
            const pct =
              totalPurchased > 0
                ? Math.max(0, Math.min(100, Math.round((remaining / totalPurchased) * 100)))
                : 100;

            return (
              <div key={item.id} className="app-card pantry-item-card">
                <div className="pantry-item-inner">
                  <div className="pantry-item-header">
                    <div className="pantry-item-name" title={item.ingredientName}>
                      {item.ingredientName}
                    </div>
                    <div className="pantry-item-badge">bought {daysSince(item.lastPurchaseDate)}</div>
                  </div>

                  <div className="pantry-item-progress">
                    <div className="pantry-progress-track" aria-hidden="true">
                      <div className="pantry-progress-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="pantry-item-qty">
                      {remaining}{item.unit} remaining of {totalPurchased}{item.unit} purchased
                    </div>
                  </div>

                  {item.purchaseBreakdowns.length > 0 && (
                    <div className="pantry-item-breakdown">
                      <span className="pantry-breakdown-label">Purchased from:</span>{' '}
                      {item.purchaseBreakdowns.map((b, idx) => (
                        <span key={idx} className="pantry-breakdown-item">
                          {formatPurchaseBreakdown(b)}{idx < item.purchaseBreakdowns.length - 1 ? '; ' : ''}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="pantry-item-actions">
                    <button className="btn-app-ghost" onClick={() => setAddingFor(item.ingredientName)}>
                      + Add stock
                    </button>
                    <label className="pantry-auto-toggle">
                      <input
                        type="checkbox"
                        checked={item.autoReorder}
                        onChange={() => handleToggle(item)}
                        style={{ accentColor: 'var(--protein-color)' }}
                      />
                      <span>Auto-reorder</span>
                    </label>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {addingFor !== null && (
        <AddStockModal
          ingredientName={addingFor || undefined}
          onClose={() => setAddingFor(null)}
          onAdded={load}
        />
      )}

      <style>{`
        .pantry-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 1rem;
          align-items: stretch;
        }

        .pantry-item-card {
          overflow: hidden;
        }

        .pantry-item-inner {
          padding: 1rem 1.125rem 1.125rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .pantry-item-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.75rem;
        }

        .pantry-item-name {
          font-family: 'DM Sans, sans-serif';
          font-size: 1.05rem;
          font-weight: 650;
          color: var(--parchment);
          line-height: 1.2;
          flex: 1;
          min-width: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .pantry-item-badge {
          flex-shrink: 0;
          font-family: 'DM Sans, monospace';
          font-size: 0.7rem;
          font-weight: 650;
          color: var(--text-subtle);
          background: var(--app-border);
          padding: 0.2rem 0.5rem;
          border-radius: 999px;
        }

        .pantry-item-progress {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }

        .pantry-progress-track {
          height: 9px;
          border-radius: 999px;
          background: var(--app-border);
          overflow: hidden;
        }

        .pantry-progress-fill {
          height: 100%;
          border-radius: 999px;
          background: var(--protein-color);
          transition: width 0.3s ease;
        }

        .pantry-item-qty {
          font-family: 'DM Sans, monospace';
          font-size: 0.75rem;
          color: var(--text-muted);
        }

        .pantry-item-breakdown {
          font-family: 'DM Sans, sans-serif';
          font-size: 0.8rem;
          color: var(--text-muted);
          line-height: 1.35;
        }

        .pantry-breakdown-label {
          font-family: 'DM Sans, monospace';
          font-size: 0.7rem;
          font-weight: 650;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--text-subtle);
        }

        .pantry-item-actions {
          margin-top: 0.25rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          flex-wrap: wrap;
        }

        .pantry-auto-toggle {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          font-family: 'DM Sans, sans-serif';
          font-size: 0.8rem;
          color: var(--text-muted);
          user-select: none;
        }

        .pantry-auto-toggle input {
          transform: translateY(0.5px);
        }

        @media (max-width: 640px) {
          .page-header-bar { flex-direction: column; align-items: flex-start; }
          .pantry-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
