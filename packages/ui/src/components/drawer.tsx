"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";

export interface DrawerProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly children: ReactNode;
  readonly side?: "left" | "right";
}

/** Modal side panel on the native <dialog>, so focus trapping and Escape come from the browser. */
export function Drawer({ open, onClose, title, children, side = "right" }: DrawerProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={`m-0 h-dvh max-h-none w-[min(24rem,90vw)] max-w-none border-border bg-surface p-0 text-fg backdrop:bg-overlay ${
        side === "right" ? "ml-auto border-l" : "mr-auto border-r"
      }`}
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 id={titleId} className="font-display text-lg font-semibold">
          {title}
        </h2>
        <button
          type="button"
          data-action="drawer.close"
          onClick={onClose}
          className="rounded-md p-1.5 text-fg-muted hover:bg-surface-alt hover:text-fg focus-visible:outline-2 focus-visible:outline-focus"
        >
          <X aria-hidden className="size-4" />
          <span className="sr-only">Close {title}</span>
        </button>
      </div>
      <div className="overflow-y-auto p-4">{children}</div>
    </dialog>
  );
}
