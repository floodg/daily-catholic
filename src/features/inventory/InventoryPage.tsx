import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { InventoryTransaction } from '../../domain/types';
import {
  createInventoryTransaction,
  getIngredientStockLevels,
  getInventoryTransactions,
} from './api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayLocalISO(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatTransactionType(type: string): string {
  switch (type) {
    case 'purchase': return '🛒 Purchase';
    case 'meal_consumption': return '🍽️ Meal';
    case 'waste': return '🗑️ Waste';
    case 'manual_adjustment': return '✏️ Manual';
    default: return type;
  }
}

// ─── Adjustment Form ──────────────────────────────────────────────────────────

interface AdjustFormProps {
  userId: string;
  onSaved: () => void;
  onCancel: () => void;
}

function AdjustForm({ userId, onSaved, onCancel }: AdjustFormProps) {
  const [ingredientName, setIngredientName] = useState('');
  const [quantityDelta, setQuantityDelta] = useState('');
  const [unit, setUnit] = useState('');
  const [transactionType, setTransactionType] = useState<'manual_adjustment' | 'waste'>('manual_adjustment');
  const [occurredAt, setOccurredAt] = useState(todayLocalISO());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const delta = parseFloat(quantityDelta);
    if (!ingredientName.trim()) {
      setError('Ingredient name is required.');
      return;
    }
    if (isNaN(delta) || delta === 0) {
      setError('Quantity must be a non-zero number. Use negative values to decrease stock.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await createInventoryTransaction({
        userId,
        ingredientName: ingredientName.trim(),
        quantityDelta: delta,
        unit: unit.trim() || undefined,
        transactionType,
        occurredAt: new Date(occurredAt).toISOString(),
      });
      onSaved();
    } catch (err) {
      setError('Failed to save adjustment. Please try again.');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="app-card" style={{ padding: '1.25rem 1.5rem 1.5rem' }} onSubmit={handleSubmit}>
      <h2 style={{ margin: '0 0 1rem', fontFamily: "'Cinzel', serif", fontSize: '1rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--parchment)' }}>
        Adjust Inventory
      </h2>
      {error && <p className="form-error">{error}</p>}

      <div className="form-group">
        <label htmlFor="adj-ingredient" className="app-label">Ingredient</label>
        <input
          id="adj-ingredient"
          type="text"
          value={ingredientName}
          onChange={e => setIngredientName(e.target.value)}
          placeholder="e.g. Mozzarella, Avocado"
          className="app-input"
          autoFocus
        />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="adj-qty" className="app-label">Quantity</label>
          <input
            id="adj-qty"
            type="number"
            step="any"
            value={quantityDelta}
            onChange={e => setQuantityDelta(e.target.value)}
            placeholder="e.g. 200 or -1"
            className="app-input"
          />
          <p className="form-hint">Use a negative number to decrease stock.</p>
        </div>

        <div className="form-group">
          <label htmlFor="adj-unit" className="app-label">Unit (optional)</label>
          <input
            id="adj-unit"
            type="text"
            value={unit}
            onChange={e => setUnit(e.target.value)}
            placeholder="e.g. g, ml, units"
            className="app-input"
          />
        </div>
      </div>

      <div className="form-group">
        <label className="app-label">Type</label>
        <div className="radio-group">
          <label>
            <input
              type="radio"
              name="adj-type"
              value="manual_adjustment"
              checked={transactionType === 'manual_adjustment'}
              onChange={() => setTransactionType('manual_adjustment')}
            />
            Manual adjustment
          </label>
          <label>
            <input
              type="radio"
              name="adj-type"
              value="waste"
              checked={transactionType === 'waste'}
              onChange={() => setTransactionType('waste')}
            />
            Waste (stock thrown away)
          </label>
        </div>
        <p className="form-hint">
          For waste, use a negative quantity to record food thrown away.
        </p>
      </div>

      <div className="form-group">
        <label htmlFor="adj-date" className="app-label">Date &amp; Time</label>
        <input
          id="adj-date"
          type="datetime-local"
          value={occurredAt}
          onChange={e => setOccurredAt(e.target.value)}
          className="app-input"
        />
      </div>

      <div className="form-actions">
        <button type="submit" className="btn-app-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save Adjustment'}
        </button>
        <button type="button" className="btn-app-secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function InventoryPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [stock, setStock] = useState<Record<string, Record<string, number>>>({});
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);

  // Fetch current user id
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });
  }, []);

  // Load stock levels and recent transactions
  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [stockData, txData] = await Promise.all([
        getIngredientStockLevels(),
        getInventoryTransactions(),
      ]);
      setStock(stockData);
      setTransactions(txData);
    } catch (err) {
      setError('Failed to load inventory data.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAdjustmentSaved = () => {
    setShowForm(false);
    loadData();
  };

  // Build a flat sorted list of ingredients from the stock map
  const stockRows = Object.entries(stock)
    .flatMap(([ingredient, units]) =>
      Object.entries(units).map(([unit, qty]) => ({ ingredient, unit, qty }))
    )
    .sort((a, b) => a.ingredient.localeCompare(b.ingredient));

  const sectionLabelStyle: React.CSSProperties = {
    fontSize: '0.65rem',
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'var(--text-subtle)',
    fontFamily: 'DM Sans, sans-serif',
    marginBottom: '0.75rem',
  };

  const emptyTextStyle: React.CSSProperties = {
    margin: 0,
    fontFamily: 'DM Sans, sans-serif',
    color: 'var(--text-muted)',
    fontSize: '0.9rem',
  };

  return (
    <div>
      <div className="page-header-bar">
        <div>
          <div className="page-eyebrow">Stock &amp; history</div>
          <h1 className="page-title">📦 <em>Inventory</em></h1>
        </div>
        {!showForm && (
          <button className="btn-app-primary" onClick={() => setShowForm(true)}>
            + Adjust Stock
          </button>
        )}
      </div>

      {showForm && userId && (
        <div style={{ marginBottom: '1.25rem' }}>
          <AdjustForm
            userId={userId}
            onSaved={handleAdjustmentSaved}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {loading ? (
        <div className="app-card" style={{ padding: '1.25rem' }}>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontFamily: 'DM Sans, sans-serif' }}>Loading…</p>
        </div>
      ) : error ? (
        <div className="app-card" style={{ padding: '1.25rem', borderColor: 'rgba(220,38,38,0.25)', background: 'rgba(220,38,38,0.08)' }}>
          <p style={{ margin: 0, color: '#b91c1c', fontFamily: 'DM Sans, sans-serif', fontWeight: 600 }}>{error}</p>
        </div>
      ) : (
        <>
          {/* ── Current Stock ── */}
          <div className="app-card" style={{ marginBottom: '1.25rem', overflow: 'hidden' }}>
            <div style={{ padding: '1rem 1.25rem 0.75rem', borderBottom: '1px solid var(--app-border)' }}>
              <div style={sectionLabelStyle}>Current Stock</div>
              {!loading && (
                <div style={{ fontSize: '0.7rem', color: 'var(--text-subtle)', fontFamily: 'DM Sans, sans-serif', letterSpacing: '0.05em' }}>
                  {stockRows.length} {stockRows.length === 1 ? 'item' : 'items'}
                </div>
              )}
            </div>
            <div style={{ padding: '1rem 1.25rem' }}>
              {stockRows.length === 0 ? (
                <p style={emptyTextStyle}>No inventory recorded yet. Add a shopping trip or adjust stock manually.</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'DM Sans, sans-serif', fontSize: '0.9rem' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem 0.5rem 0', color: 'var(--text-subtle)', fontWeight: 600, fontSize: '0.75rem' }}>Ingredient</th>
                      <th style={{ textAlign: 'right', padding: '0.5rem 0.75rem', color: 'var(--text-subtle)', fontWeight: 600, fontSize: '0.75rem' }}>Quantity</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem 0', color: 'var(--text-subtle)', fontWeight: 600, fontSize: '0.75rem' }}>Unit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockRows.map(({ ingredient, unit, qty }) => (
                      <tr key={`${ingredient}-${unit}`} style={{ borderTop: '1px solid var(--app-border)' }}>
                        <td style={{ padding: '0.625rem 0.75rem 0.625rem 0', color: 'var(--parchment)', fontWeight: 500 }}>{ingredient}</td>
                        <td style={{ textAlign: 'right', padding: '0.625rem 0.75rem', color: qty < 0 ? '#f87171' : 'var(--parchment)', fontFamily: 'DM Sans, monospace' }}>{qty}</td>
                        <td style={{ padding: '0.625rem 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>{unit || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* ── Recent Transactions ── */}
          <div className="app-card" style={{ marginBottom: '1.25rem', overflow: 'hidden' }}>
            <div style={{ padding: '1rem 1.25rem 0.75rem', borderBottom: '1px solid var(--app-border)' }}>
              <div style={sectionLabelStyle}>Transaction History</div>
              {!loading && (
                <div style={{ fontSize: '0.7rem', color: 'var(--text-subtle)', fontFamily: 'DM Sans, sans-serif', letterSpacing: '0.05em' }}>
                  {transactions.length} {transactions.length === 1 ? 'transaction' : 'transactions'}
                </div>
              )}
            </div>
            <div style={{ padding: '1rem 1.25rem' }}>
              {transactions.length === 0 ? (
                <p style={emptyTextStyle}>No transactions yet.</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'DM Sans, sans-serif', fontSize: '0.85rem' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem 0.5rem 0', color: 'var(--text-subtle)', fontWeight: 600, fontSize: '0.75rem' }}>Date</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', color: 'var(--text-subtle)', fontWeight: 600, fontSize: '0.75rem' }}>Ingredient</th>
                      <th style={{ textAlign: 'right', padding: '0.5rem 0.75rem', color: 'var(--text-subtle)', fontWeight: 600, fontSize: '0.75rem' }}>Change</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', color: 'var(--text-subtle)', fontWeight: 600, fontSize: '0.75rem' }}>Unit</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem 0', color: 'var(--text-subtle)', fontWeight: 600, fontSize: '0.75rem' }}>Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map(tx => (
                      <tr key={tx.id} style={{ borderTop: '1px solid var(--app-border)' }}>
                        <td style={{ padding: '0.5rem 0.75rem 0.5rem 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>{formatDate(tx.occurredAt)}</td>
                        <td style={{ padding: '0.5rem 0.75rem', color: 'var(--parchment)', fontWeight: 500 }}>{tx.ingredientName}</td>
                        <td style={{ textAlign: 'right', padding: '0.5rem 0.75rem', color: tx.quantityDelta < 0 ? '#b91c1c' : 'var(--protein-color)', fontFamily: 'DM Sans, monospace' }}>
                          {tx.quantityDelta > 0 ? '+' : ''}{tx.quantityDelta}
                        </td>
                        <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-muted)' }}>{tx.unit || '—'}</td>
                        <td style={{ padding: '0.5rem 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>{formatTransactionType(tx.transactionType)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* ── Links ── */}
          <div className="app-card" style={{ padding: '1.25rem 1.5rem' }}>
            <div style={sectionLabelStyle}>Plan and shop from here</div>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <Link to="/app/shopping" className="btn-app-ghost">Shopping List</Link>
              <Link to="/app/shopping-trips" className="btn-app-ghost">Shopping Trips</Link>
              <Link to="/app/plan" className="btn-app-ghost">Weekly Plan</Link>
              <Link to="/app/dashboard" className="btn-app-secondary">Dashboard</Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
