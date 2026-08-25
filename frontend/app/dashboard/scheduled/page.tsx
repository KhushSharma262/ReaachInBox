"use client";

import { useCallback, useEffect, useState } from "react";
import { EmailTable, TableStates } from "@/components/EmailTable";
import { apiFetch } from "@/lib/api";

export default function ScheduledPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await apiFetch("/api/emails/scheduled?page=" + page + "&limit=20");
      setRows(json.data);
      setTotalPages(json.meta?.totalPages ?? 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <h1 className="text-lg font-semibold tracking-tight text-slate-900">Scheduled emails</h1>
      <p className="mt-0.5 text-[13px] text-slate-500">Emails queued for future delivery.</p>

      <div className="mt-6">
        <TableStates
          loading={loading}
          error={error}
          empty={rows.length === 0}
          emptyText="Scheduled emails will appear here once you create a campaign."
          onRetry={load}
        />
        {!loading && !error && rows.length > 0 && (
          <>
            <EmailTable rows={rows} timeLabel="Scheduled Time" timeKey="scheduledAt" />
            <div className="mt-4 flex flex-col items-center justify-between gap-3 text-[13px] sm:flex-row">
              <span className="text-slate-500">Page {page} of {totalPages}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[13px] font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[13px] font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
