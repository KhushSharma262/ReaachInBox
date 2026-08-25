"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

const STATUS_STYLES: Record<string, string> = {
  SENT: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  FAILED: "bg-red-50 text-red-700 ring-red-600/20",
  SCHEDULED: "bg-slate-100 text-slate-600 ring-slate-500/20",
  RESCHEDULED: "bg-amber-50 text-amber-700 ring-amber-600/20",
  PROCESSING: "bg-blue-50 text-blue-700 ring-blue-600/20",
  CANCELLED: "bg-slate-50 text-slate-400 ring-slate-300/40",
};

export function StatusBadge(props: { status: string }) {
  const cls = STATUS_STYLES[props.status] || STATUS_STYLES.SCHEDULED;
  const label = props.status.charAt(0) + props.status.slice(1).toLowerCase();
  return (
    <span className={"inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset " + cls}>
      {label}
    </span>
  );
}

export function fmt(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function PreviewLink(props: { url?: string | null }) {
  if (!props.url) return <span className="text-slate-300">—</span>;
  return (
    <a href={props.url} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-[13px] font-medium text-slate-700 underline decoration-slate-300 underline-offset-2 transition hover:text-slate-900 hover:decoration-slate-900">
      View
      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M7 17 17 7M9 7h8v8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </a>
  );
}

export function EmailTable(props: {
  rows: any[];
  timeLabel: string;
  timeKey: string;
  showPreview?: boolean;
}) {
  return (
    <>
      {/* Mobile: stacked cards. A 5-column table is unreadable under 640px,
          so below that breakpoint each row becomes its own block. */}
      <ul className="space-y-2.5 sm:hidden">
        {props.rows.map((r: any) => (
          <li key={r.id} className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 flex-1 break-all font-mono text-[13px] text-slate-900">{r.recipientEmail}</p>
              <StatusBadge status={r.status} />
            </div>
            <p className="mt-1.5 truncate text-[13px] text-slate-600">{r.campaign ? r.campaign.subject : "—"}</p>
            <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2.5">
              <span className="text-[11px] uppercase tracking-wide text-slate-400">
                {props.timeLabel}: <span className="normal-case text-slate-600">{fmt(r[props.timeKey])}</span>
              </span>
              {props.showPreview && <PreviewLink url={r.previewUrl} />}
            </div>
            {r.errorMessage && <p className="mt-2 text-[11px] text-red-600">{r.errorMessage}</p>}
          </li>
        ))}
      </ul>

      {/* Desktop */}
      <div className="hidden overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:block">
        <table className="w-full text-left">
          <thead className="border-b border-slate-200/80 bg-slate-50/60">
            <tr className="text-[11px] uppercase tracking-wide text-slate-500">
              <th className="px-5 py-2.5 font-medium">Email</th>
              <th className="px-5 py-2.5 font-medium">Subject</th>
              <th className="px-5 py-2.5 font-medium whitespace-nowrap">{props.timeLabel}</th>
              <th className="px-5 py-2.5 font-medium">Status</th>
              {props.showPreview ? <th className="px-5 py-2.5 font-medium">Preview</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {props.rows.map((r: any) => (
              <tr key={r.id} className="transition hover:bg-slate-50/60">
                <td className="max-w-[220px] truncate px-5 py-3 font-mono text-[13px] text-slate-900">{r.recipientEmail}</td>
                <td className="max-w-[260px] truncate px-5 py-3 text-[13px] text-slate-600">
                  {r.campaign ? r.campaign.subject : "—"}
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-[13px] text-slate-600">{fmt(r[props.timeKey])}</td>
                <td className="px-5 py-3">
                  <StatusBadge status={r.status} />
                  {r.errorMessage && (
                    <p className="mt-1 max-w-[200px] truncate text-[11px] text-red-600" title={r.errorMessage}>
                      {r.errorMessage}
                    </p>
                  )}
                </td>
                {props.showPreview ? <td className="px-5 py-3"><PreviewLink url={r.previewUrl} /></td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function TableStates(props: {
  loading: boolean;
  error: string | null;
  empty: boolean;
  emptyText: string;
  onRetry: () => void;
}) {
  if (props.loading) {
    return (
      <div className="space-y-2.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-xl border border-slate-200/80 bg-white p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="h-3 w-40 animate-pulse rounded bg-slate-200" />
              <div className="h-3 w-48 animate-pulse rounded bg-slate-100" />
              <div className="h-4 w-14 animate-pulse rounded-full bg-slate-100" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (props.error) {
    return (
      <div className="rounded-xl border border-red-200/80 bg-red-50/60 p-8 text-center">
        <p className="text-sm font-medium text-red-900">Could not load emails</p>
        <p className="mt-1 text-[13px] text-red-600">{props.error}</p>
        <button onClick={props.onRetry}
          className="mt-4 rounded-lg bg-white px-4 py-1.5 text-[13px] font-medium text-red-700 ring-1 ring-red-200 transition hover:bg-red-50">
          Try again
        </button>
      </div>
    );
  }

  if (props.empty) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white/50 px-6 py-14 text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
          <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 6h16v12H4z M4 7l8 6 8-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <p className="mt-3 text-sm font-medium text-slate-700">Nothing here yet</p>
        <p className="mt-1 text-[13px] text-slate-500">{props.emptyText}</p>
      </div>
    );
  }

  return null;
}
