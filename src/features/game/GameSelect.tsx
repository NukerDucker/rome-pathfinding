// Pixel-art dropdown for the game UI (ported from ui-game's script.js
// CUSTOM DROPDOWNS): a button on the vine plank opens a listbox in the
// vine-wood 9-slice frame (game.css: .dd-btn, .dd-list, .dd-option).
// Replaces the native <select>, whose open list the browser draws unstyled.
// Keyboard: arrows / Home / End / PageUp / PageDown move, Enter / Space pick,
// Escape closes, a letter jumps to the next option starting with it.
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

type Props = {
  id: string
  className: string
  ariaLabel: string
  title?: string
  value: string
  options: [value: string, label: string][]
  onChange: (value: string) => void
}

export default function GameSelect({ id, className, ariaLabel, title, value, options, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const wrapRef = useRef<HTMLSpanElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const listId = id + 'List'
  const selectedIdx = Math.max(0, options.findIndex(([v]) => v === value))
  const label = options[selectedIdx]?.[1] ?? ''

  // Click anywhere outside closes it
  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [open])

  // Focus the list on open; keep the highlighted option in view
  useEffect(() => {
    if (open) listRef.current?.focus({ preventScroll: true })
  }, [open])
  useEffect(() => {
    if (open) listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  const show = () => { setActive(selectedIdx); setOpen(true) }
  const close = (refocus = true) => { setOpen(false); if (refocus) btnRef.current?.focus() }
  const move = (i: number) => setActive(Math.max(0, Math.min(options.length - 1, i)))
  const choose = (i: number) => {
    close()
    if (options[i] && options[i][0] !== value) onChange(options[i][0])
  }

  const onBtnKey = (e: KeyboardEvent) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); show() }
  }
  const onListKey = (e: KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown': move(active + 1); break
      case 'ArrowUp': move(active - 1); break
      case 'Home': move(0); break
      case 'End': move(options.length - 1); break
      case 'PageDown': move(active + 5); break
      case 'PageUp': move(active - 5); break
      case 'Enter': case ' ': choose(active); break
      case 'Escape': close(); break
      case 'Tab': close(false); return // let focus move on
      default: {
        if (e.key.length !== 1) return
        const k = e.key.toLowerCase()
        const n = options.length
        for (let s = 1; s <= n; s++) {
          const j = (active + s) % n
          if (options[j][1].toLowerCase().startsWith(k)) { setActive(j); break }
        }
      }
    }
    e.preventDefault()
  }

  return (
    <span className="select-wrap" ref={wrapRef}>
      <button
        ref={btnRef}
        type="button"
        id={id}
        className={'dd-btn ' + className}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel + ': ' + label}
        title={title}
        onClick={() => (open ? close() : show())}
        onKeyDown={onBtnKey}
      >
        {label}
      </button>
      {open && (
        <ul
          ref={listRef}
          id={listId}
          className="dd-list"
          role="listbox"
          aria-label={ariaLabel}
          aria-activedescendant={`${listId}-${active}`}
          tabIndex={-1}
          onKeyDown={onListKey}
        >
          {options.map(([v, text], i) => (
            <li
              key={v}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={v === value}
              className={'dd-option' + (i === active ? ' active' : '')}
              onMouseMove={() => { if (i !== active) setActive(i) }}
              onClick={() => choose(i)}
            >
              {text}
            </li>
          ))}
        </ul>
      )}
    </span>
  )
}
