"use client";

import { CornerDownLeft, Search } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { filterCommands, type CommandItem } from "../commands.js";

export interface CommandBarProps {
  readonly items: readonly CommandItem[];
  /** Called with the chosen item's href. The app routes; this component never fakes an action. */
  readonly onNavigate: (href: string) => void;
}

/**
 * Global jump-to command bar (⌘K / Ctrl+K). Phase 03 scope is navigation only;
 * search and Origin Intelligence questions arrive with their phases.
 */
export function CommandBar({ items, onNavigate }: CommandBarProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const results = useMemo(() => filterCommands(items, query), [items, query]);

  // The native dialog owns open/closed state (Escape, focus trap, focus return);
  // React only asks it to open or close, so the two can never disagree.
  const show = useCallback(() => {
    const d = dialogRef.current;
    if (!d || d.open) return;
    setQuery("");
    setActive(0);
    d.showModal();
    inputRef.current?.focus();
  }, []);
  const hide = useCallback(() => dialogRef.current?.close(), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (dialogRef.current?.open) hide();
        else show();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [show, hide]);

  function choose(item: CommandItem | undefined) {
    if (!item) return;
    hide();
    onNavigate(item.href);
  }

  const activeItem = results[Math.min(active, results.length - 1)];

  return (
    <>
      <button
        type="button"
        data-action="command-bar.open"
        onClick={show}
        aria-haspopup="dialog"
        aria-keyshortcuts="Meta+K Control+K"
        className="inline-flex w-full max-w-xs items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-fg-muted hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <Search aria-hidden className="size-4" />
        <span className="flex-1 text-left">Jump to…</span>
        <kbd className="hidden rounded border border-border px-1.5 font-mono text-[11px] sm:inline">
          ⌘K
        </kbd>
      </button>
      <dialog
        ref={dialogRef}
        aria-label="Command bar"
        onClick={(e) => {
          if (e.target === dialogRef.current) hide();
        }}
        className="mx-auto mt-[12vh] w-[min(36rem,92vw)] rounded-lg border border-border bg-surface p-0 text-fg shadow-2xl backdrop:bg-overlay"
      >
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search aria-hidden className="size-4 text-fg-muted" />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeItem ? `${listId}-${activeItem.id}` : undefined}
            aria-label="Jump to a page"
            placeholder="Jump to a page…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => Math.min(i + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                choose(activeItem);
              }
            }}
            className="w-full bg-transparent py-3 text-sm text-fg outline-none placeholder:text-fg-muted"
          />
        </div>
        <ul
          id={listId}
          role="listbox"
          aria-label="Pages"
          className="max-h-80 overflow-y-auto p-1.5"
        >
          {results.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-fg-muted" role="presentation">
              No page matches “{query}”. Search across content arrives in Phase 34.
            </li>
          ) : (
            results.map((item) => (
              <li
                key={item.id}
                id={`${listId}-${item.id}`}
                role="option"
                aria-selected={item === activeItem}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(item)}
                className="flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-sm aria-selected:bg-accent-subtle aria-selected:text-accent-text"
              >
                <span>{item.label}</span>
                <span className="flex items-center gap-2 text-xs text-fg-muted">
                  {item.group}
                  {item === activeItem ? <CornerDownLeft aria-hidden className="size-3.5" /> : null}
                </span>
              </li>
            ))
          )}
        </ul>
      </dialog>
    </>
  );
}
