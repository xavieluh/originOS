import type { ReactNode } from "react";

export interface Column<Row> {
  readonly key: string;
  readonly header: string;
  readonly cell: (row: Row) => ReactNode;
  /** Monospace for IDs, hashes and timestamps. */
  readonly mono?: boolean;
  readonly align?: "start" | "end";
}

export interface DataTableProps<Row> {
  /** Describes the table for screen readers; shown visually unless captionHidden. */
  readonly caption: string;
  readonly captionHidden?: boolean;
  readonly columns: readonly Column<Row>[];
  readonly rows: readonly Row[];
  readonly rowKey: (row: Row) => string;
  /** Shown in place of the table when rows is empty. */
  readonly empty: ReactNode;
}

export function DataTable<Row>({
  caption,
  captionHidden,
  columns,
  rows,
  rowKey,
  empty,
}: DataTableProps<Row>) {
  if (rows.length === 0) return <>{empty}</>;
  return (
    <div
      className="overflow-x-auto rounded-lg border border-border bg-surface"
      tabIndex={0}
      role="region"
      aria-label={caption}
    >
      <table className="w-full border-collapse text-sm">
        <caption
          className={
            captionHidden ? "sr-only" : "px-4 pt-3 text-left text-sm font-semibold text-fg"
          }
        >
          {caption}
        </caption>
        <thead>
          <tr className="border-b border-border text-left">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={`px-4 py-2 text-xs font-semibold uppercase tracking-wide text-fg-muted ${c.align === "end" ? "text-right" : ""}`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className="border-b border-border last:border-0 even:bg-surface-alt/50"
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`px-4 py-2.5 align-top text-fg ${c.mono ? "font-mono text-xs" : ""} ${c.align === "end" ? "text-right" : ""}`}
                >
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
