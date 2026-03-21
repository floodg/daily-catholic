import { useEffect, useMemo, useState } from 'react'

export interface ComboboxProps<T> {
  items: T[]
  /** Current selected key; empty string means none selected */
  selectedKey: string
  getKey: (item: T) => string
  /** Human label for the selected value and for filtering */
  getLabel: (item: T) => string
  /** Called with the picked item key, or "" when cleared */
  onSelectKey: (key: string) => void

  placeholder?: string
  disabled?: boolean
  closeDelayMs?: number
  maxOptions?: number

  /** Optional custom filtering. Return true to include the item. */
  filter?: (item: T, query: string) => boolean

  /** Optional custom option renderer. */
  renderOption?: (item: T, state: { isSelected: boolean }) => React.ReactNode

  /** Styling hooks */
  wrapperClassName?: string
  inputClassName?: string
  listClassName?: string
  optionClassName?: string
}

export default function Combobox<T>({
  items,
  selectedKey,
  getKey,
  getLabel,
  onSelectKey,
  placeholder = 'Select…',
  disabled,
  closeDelayMs = 150,
  maxOptions = 12,
  filter,
  renderOption,
  wrapperClassName,
  inputClassName = 'app-input',
  listClassName,
  optionClassName,
}: ComboboxProps<T>) {
  const selectedItem = useMemo(
    () => items.find(i => getKey(i) === selectedKey) ?? null,
    [items, selectedKey, getKey],
  )

  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  // Keep input text in sync with selected item when closed / when selection changes.
  useEffect(() => {
    setQuery(selectedItem ? getLabel(selectedItem) : '')
  }, [selectedItem, getLabel])

  const filtered = useMemo(() => {
    const q = query.trim()
    if (!q) return items
    if (filter) return items.filter(i => filter(i, q))
    const qLower = q.toLowerCase()
    return items.filter(i => getLabel(i).toLowerCase().includes(qLower))
  }, [items, query, filter, getLabel])

  const pick = (item: T) => {
    const key = getKey(item)
    onSelectKey(key)
    setQuery(getLabel(item))
    setOpen(false)
  }

  const clear = () => {
    onSelectKey('')
    setQuery('')
    setOpen(false)
  }

  const showClear = !!selectedItem && !disabled

  return (
    <div className={wrapperClassName}>
      <div style={{ position: 'relative' }}>
        <input
          className={inputClassName}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), closeDelayMs)}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          style={{ paddingRight: showClear ? '2.25rem' : undefined }}
        />

        {showClear && (
          <button
            type="button"
            className="btn-app-ghost"
            onMouseDown={e => { e.preventDefault() }}
            onClick={clear}
            aria-label="Clear selection"
            title="Clear"
            style={{
              position: 'absolute',
              right: 6,
              top: '50%',
              transform: 'translateY(-50%)',
              padding: '0.25rem 0.5rem',
            }}
          >
            ✕
          </button>
        )}
      </div>

      {open && !disabled && filtered.length > 0 && (
        <ul className={listClassName} role="listbox">
          {filtered.slice(0, maxOptions).map(item => {
            const key = getKey(item)
            const isSelected = key === selectedKey
            return (
              <li
                key={key}
                className={optionClassName}
                onMouseDown={() => pick(item)}
                role="option"
                aria-selected={isSelected}
                style={{
                  background: isSelected ? 'var(--gold-light)' : undefined,
                }}
              >
                {renderOption ? renderOption(item, { isSelected }) : getLabel(item)}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

