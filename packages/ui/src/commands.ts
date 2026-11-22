// Pure command-bar helpers, importable from server code.

export interface CommandItem {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly group: string;
  readonly keywords?: readonly string[];
}

/** Case-insensitive match on label, group and keywords; every query word must match. */
export function filterCommands(items: readonly CommandItem[], query: string): CommandItem[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...items];
  return items.filter((item) => {
    const hay = [item.label, item.group, ...(item.keywords ?? [])].join(" ").toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
