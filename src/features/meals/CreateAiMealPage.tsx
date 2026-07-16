import { useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Sparkles, Trash2, ExternalLink } from 'lucide-react';
import { useAuth } from '../../context/AuthProvider';
import { createMeal } from './api';
import {
  draftToMealInput,
  generateMealDraft,
  type GenerateMealDraft,
} from './generateMealApi';
import type { Ingredient } from '../../domain/types';

const STORES = ['Coles', 'Woolworths', 'Aldi', 'IGA', 'Other'] as const;

type Step = 'input' | 'loading' | 'preview';

export default function CreateAiMealPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('input');
  const [prompt, setPrompt] = useState('');
  const [store, setStore] = useState<string>('Coles');
  const [draft, setDraft] = useState<GenerateMealDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Building recipe…');

  const handleGenerate = async () => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      setError('Enter a meal idea to generate.');
      return;
    }
    setError(null);
    setStep('loading');
    setLoadingMessage('Building recipe…');
    const productTimer = window.setTimeout(() => {
      setLoadingMessage('Finding store products…');
    }, 2500);

    try {
      const result = await generateMealDraft(trimmed, store);
      setDraft(result);
      setStep('preview');
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to generate meal');
      setStep('input');
    } finally {
      window.clearTimeout(productTimer);
    }
  };

  const handleRemoveIngredient = (id: string) => {
    if (!draft) return;
    setDraft({
      ...draft,
      ingredients: draft.ingredients.filter((ing) => ing.id !== id),
    });
  };

  const handleConfirm = async () => {
    if (!user || !draft) return;
    if (!draft.name.trim()) {
      setError('Meal name is required.');
      return;
    }
    if (draft.ingredients.length === 0) {
      setError('Add at least one ingredient before confirming.');
      return;
    }
    setConfirming(true);
    setError(null);
    try {
      const meal = draftToMealInput(draft);
      await createMeal({ ...meal, userId: user.id });
      navigate('/app/meals');
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to save meal');
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div style={{ width: '100%', minWidth: 0, maxWidth: 720 }}>
      <div className="page-header-bar">
        <div>
          <p className="page-eyebrow">Food Library</p>
          <h1 className="page-title">Create with <em>AI</em></h1>
        </div>
        <Link to="/app/meals" className="btn-app-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
          <ArrowLeft size={16} />
          Back to Meals
        </Link>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            marginBottom: '1rem',
            padding: '0.75rem 1rem',
            borderRadius: 8,
            background: 'rgba(200,80,80,0.12)',
            color: 'var(--parchment)',
            fontFamily: 'DM Sans, sans-serif',
            fontSize: '0.875rem',
          }}
        >
          {error}
        </div>
      )}

      {step === 'input' && (
        <div className="app-card" style={{ padding: '1.25rem' }}>
          <label style={labelStyle}>Meal idea</label>
          <textarea
            className="app-input"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            placeholder='e.g. "keto chicken dinner for 2 with broccoli"'
            style={{ resize: 'vertical', marginBottom: '1rem' }}
          />

          <label style={labelStyle}>Store</label>
          <select
            className="app-input"
            value={store}
            onChange={(e) => setStore(e.target.value)}
            style={{ marginBottom: '1.25rem' }}
          >
            {STORES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <button
            type="button"
            className="btn-app-primary"
            onClick={handleGenerate}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}
          >
            <Sparkles size={16} />
            Generate meal
          </button>
        </div>
      )}

      {step === 'loading' && (
        <div className="app-card" style={{ padding: '2.5rem 1.25rem', textAlign: 'center' }}>
          <Loader2
            size={28}
            style={{ animation: 'spin 1s linear infinite', color: 'var(--gold)', marginBottom: '0.75rem' }}
          />
          <p style={{ fontFamily: 'DM Sans, sans-serif', color: 'var(--parchment)', margin: 0 }}>
            {loadingMessage}
          </p>
          <p style={{ fontFamily: 'DM Sans, sans-serif', color: 'var(--text-subtle)', fontSize: '0.8rem', marginTop: '0.5rem' }}>
            This can take a minute while products are looked up.
          </p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {step === 'preview' && draft && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="app-card" style={{ padding: '1.25rem' }}>
            <label style={labelStyle}>Meal name</label>
            <input
              className="app-input"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              style={{ marginBottom: '0.75rem' }}
            />

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
              {(draft.tags ?? []).map((tag) => (
                <span key={tag} style={tagStyle}>{tag}</span>
              ))}
            </div>

            <p style={{ fontFamily: 'DM Sans, sans-serif', color: 'var(--text-subtle)', fontSize: '0.8rem', margin: 0 }}>
              {[
                draft.prepTimeMins != null ? `Prep ${draft.prepTimeMins} min` : null,
                draft.cookTimeMins != null ? `Cook ${draft.cookTimeMins} min` : null,
                `Store: ${store}`,
              ].filter(Boolean).join(' · ')}
            </p>
          </div>

          <div className="app-card" style={{ padding: '1.25rem' }}>
            <h2 style={sectionTitleStyle}>Ingredients</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {draft.ingredients.map((ing) => (
                <IngredientPreviewRow
                  key={ing.id}
                  ingredient={ing}
                  onRemove={() => handleRemoveIngredient(ing.id)}
                />
              ))}
              {draft.ingredients.length === 0 && (
                <p style={{ color: 'var(--text-subtle)', fontFamily: 'DM Sans, sans-serif', fontSize: '0.875rem' }}>
                  No ingredients left — go back and regenerate.
                </p>
              )}
            </div>
          </div>

          <div className="app-card" style={{ padding: '1.25rem' }}>
            <h2 style={sectionTitleStyle}>Instructions</h2>
            <ol style={{ margin: 0, paddingLeft: '1.25rem', fontFamily: 'DM Sans, sans-serif', color: 'var(--parchment)', lineHeight: 1.55 }}>
              {draft.instructions.map((stepText, idx) => (
                <li key={idx} style={{ marginBottom: '0.5rem' }}>{stepText}</li>
              ))}
            </ol>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            <button
              type="button"
              className="btn-app-primary"
              disabled={confirming}
              onClick={handleConfirm}
            >
              {confirming ? 'Saving…' : 'Confirm & add meal'}
            </button>
            <button
              type="button"
              className="btn-app-ghost"
              disabled={confirming}
              onClick={() => {
                setDraft(null);
                setStep('input');
              }}
            >
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function IngredientPreviewRow({
  ingredient,
  onRemove,
}: {
  ingredient: Ingredient;
  onRemove: () => void;
}) {
  const product = ingredient.primaryProduct;
  const qty =
    ingredient.quantity ??
    (ingredient.quantityNum != null && ingredient.unit
      ? `${ingredient.quantityNum}${ingredient.unit === 'units' ? '' : ingredient.unit}`
      : null);

  return (
    <div
      style={{
        display: 'flex',
        gap: '0.75rem',
        alignItems: 'flex-start',
        padding: '0.75rem',
        borderRadius: 8,
        background: 'var(--app-bg)',
      }}
    >
      {product?.imageUrl ? (
        <img
          src={product.imageUrl}
          alt=""
          width={56}
          height={56}
          style={{ objectFit: 'contain', borderRadius: 6, background: '#fff', flexShrink: 0 }}
        />
      ) : (
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 6,
            background: 'rgba(201,168,76,0.1)',
            flexShrink: 0,
            display: 'grid',
            placeItems: 'center',
            color: 'var(--text-subtle)',
            fontSize: '0.7rem',
            fontFamily: 'DM Sans, sans-serif',
          }}
        >
          No img
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 700, color: 'var(--parchment)', fontSize: '0.9rem' }}>
          {ingredient.name}
          {qty ? <span style={{ fontWeight: 500, color: 'var(--text-subtle)' }}> · {qty}</span> : null}
        </div>
        {product ? (
          <div style={{ marginTop: '0.2rem' }}>
            <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '0.8rem', color: 'var(--parchment)' }}>
              {[product.brand, product.name].filter(Boolean).join(' — ')}
            </div>
            <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '0.75rem', color: 'var(--text-subtle)' }}>
              {[product.sizeLabel, product.store].filter(Boolean).join(' · ')}
            </div>
            {product.productUrl && (
              <a
                href={product.productUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  marginTop: 4,
                  fontSize: '0.75rem',
                  color: 'var(--gold)',
                  fontFamily: 'DM Sans, sans-serif',
                }}
              >
                View product <ExternalLink size={12} />
              </a>
            )}
          </div>
        ) : (
          <div style={{ marginTop: '0.2rem', fontFamily: 'DM Sans, sans-serif', fontSize: '0.75rem', color: 'var(--text-subtle)' }}>
            No store product found — ingredient will still be saved.
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${ingredient.name}`}
        className="btn-app-ghost"
        style={{ padding: '0.35rem', flexShrink: 0 }}
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}

const labelStyle: CSSProperties = {
  display: 'block',
  fontFamily: 'DM Sans, sans-serif',
  fontSize: '0.75rem',
  fontWeight: 600,
  color: 'var(--text-subtle)',
  marginBottom: '0.35rem',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const sectionTitleStyle: CSSProperties = {
  fontFamily: 'DM Sans, sans-serif',
  fontSize: '1rem',
  fontWeight: 700,
  color: 'var(--parchment)',
  margin: '0 0 0.75rem',
};

const tagStyle: CSSProperties = {
  fontSize: '0.7rem',
  fontFamily: 'DM Sans, sans-serif',
  fontWeight: 600,
  padding: '0.15rem 0.5rem',
  borderRadius: 999,
  background: 'rgba(201,168,76,0.15)',
  color: 'var(--gold)',
};
