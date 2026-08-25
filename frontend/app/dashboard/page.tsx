"use client";

import { useState, useMemo } from "react";
import { RecipientUpload, ParseResult } from "@/components/RecipientUpload";
import { apiPost } from "@/lib/api";

function localNow(offsetMin: number) {
  const d = new Date(Date.now() + offsetMin * 60000);
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
    "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
}

export default function ComposePage() {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [recipients, setRecipients] = useState<ParseResult>({ valid: [], invalid: [], duplicates: 0 });
  const [startAt, setStartAt] = useState(localNow(5));
  const [delaySec, setDelaySec] = useState(2);
  const [maxPerHour, setMaxPerHour] = useState(100);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const count = recipients.valid.length;

  // Client-side mirror of the server rules. The backend re-validates
  // everything — this only exists to fail fast and explain why.
  const problems = useMemo(() => {
    const p: string[] = [];
    if (!subject.trim()) p.push("Subject is required.");
    if (!body.trim()) p.push("Body is required.");
    if (count === 0) p.push("Add at least one recipient.");
    if (new Date(startAt).getTime() < Date.now() + 60000) p.push("Start time must be at least 1 minute from now.");
    if (delaySec < 0) p.push("Delay cannot be negative.");
    if (maxPerHour < 1) p.push("Hourly limit must be at least 1.");
    return p;
  }, [subject, body, count, startAt, delaySec, maxPerHour]);

  // Projection: how long this campaign actually takes given the two
  // independent constraints — spacing between emails, and the hourly cap.
  const projection = useMemo(() => {
    if (count === 0) return null;
    const spanMin = ((count - 1) * delaySec) / 60;
    const hoursNeeded = Math.ceil(count / maxPerHour);
    const firstHourCount = Math.min(count, maxPerHour);
    return { spanMin, hoursNeeded, firstHourCount, deferred: count - firstHourCount };
  }, [count, delaySec, maxPerHour]);

  async function submit() {
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const res: any = await apiPost("/api/campaigns", {
        subject: subject.trim(),
        body: body.trim(),
        recipientEmails: recipients.valid,
        scheduledStartAt: new Date(startAt).toISOString(),
        minDelayMs: delaySec * 1000,
        maxPerHour,
      });
      setSuccess("Scheduled " + res.data.totalRecipients + " emails. " + res.data.enqueuedCount + " jobs queued.");
      setSubject(""); setBody("");
      setRecipients({ valid: [], invalid: [], duplicates: 0 });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not schedule campaign.");
    } finally {
      setSubmitting(false);
    }
  }

  const input = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900";

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h1 className="text-lg font-semibold text-slate-900">Compose campaign</h1>
          <p className="mt-1 text-sm text-slate-500">Write once, deliver at a controlled rate.</p>

          <div className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">Subject</label>
              <input value={subject} onChange={(e) => setSubject(e.target.value)}
                placeholder="Quick question about your team" className={input} />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Body</label>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8}
                placeholder="Hi there," className={input} />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <RecipientUpload onChange={setRecipients} />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-slate-900">Delivery settings</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-slate-600">Start time</label>
              <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} className={input} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600">Delay between emails (s)</label>
              <input type="number" min={0} value={delaySec}
                onChange={(e) => setDelaySec(Number(e.target.value))} className={input} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600">Max per hour</label>
              <input type="number" min={1} value={maxPerHour}
                onChange={(e) => setMaxPerHour(Number(e.target.value))} className={input} />
            </div>
          </div>
        </div>
      </div>

      <div className="lg:col-span-1">
        <div className="sticky top-6 rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-slate-900">Summary</h2>

          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Recipients</dt>
              <dd className="font-medium text-slate-900">{count}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Spacing</dt>
              <dd className="font-medium text-slate-900">{delaySec}s</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Hourly cap</dt>
              <dd className="font-medium text-slate-900">{maxPerHour}</dd>
            </div>
          </dl>

          {projection && (
            <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
              <p><span className="font-medium text-slate-900">{projection.firstHourCount}</span> send in the first hour.</p>
              {projection.deferred > 0 && (
                <p className="mt-1">
                  <span className="font-medium text-slate-900">{projection.deferred}</span> exceed the cap and will be
                  deferred across <span className="font-medium text-slate-900">{projection.hoursNeeded}</span> hourly windows
                  — not dropped.
                </p>
              )}
              {projection.deferred === 0 && projection.spanMin > 0 && (
                <p className="mt-1">Delivery spans about {projection.spanMin.toFixed(1)} minutes.</p>
              )}
            </div>
          )}

          {problems.length > 0 && (
            <ul className="mt-4 space-y-1 text-xs text-amber-700">
              {problems.map((p) => <li key={p}>• {p}</li>)}
            </ul>
          )}

          {error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}
          {success && (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{success}</div>
          )}

          <button
            onClick={submit}
            disabled={problems.length > 0 || submitting}
            className="mt-5 w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {submitting ? "Scheduling..." : "Schedule campaign"}
          </button>
        </div>
      </div>
    </div>
  );
}
