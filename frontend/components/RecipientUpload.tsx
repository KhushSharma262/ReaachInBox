"use client";

import { useState, useRef } from "react";

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

export interface ParseResult {
  valid: string[];
  invalid: string[];
  duplicates: number;
}

/**
 * Extracts emails from CSV or plain text.
 *
 * Deliberately column-agnostic: real exports put the address in an
 * unpredictable column, so we regex the whole file rather than assume a header.
 * Dedupe is case-insensitive since SMTP local parts are case-insensitive
 * in every provider that matters.
 */
export function extractEmails(raw: string): ParseResult {
  const tokens = raw.split(/[\s,;"'<>()\[\]]+/).filter(Boolean);
  const seen = new Set<string>();
  const valid: string[] = [];
  const invalid: string[] = [];
  let duplicates = 0;

  for (const t of tokens) {
    if (t.includes("@")) {
      const m = t.match(EMAIL_RE);
      if (m && m[0] === t) {
        const key = t.toLowerCase();
        if (seen.has(key)) { duplicates++; continue; }
        seen.add(key);
        valid.push(t);
      } else {
        invalid.push(t);
      }
    }
  }

  return { valid, invalid, duplicates };
}

export function RecipientUpload(props: { onChange: (r: ParseResult) => void }) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function handle(raw: string, name: string | null) {
    setError(null);
    if (!raw.trim()) {
      setError("That file is empty.");
      setResult(null);
      props.onChange({ valid: [], invalid: [], duplicates: 0 });
      return;
    }
    const r = extractEmails(raw);
    if (r.valid.length === 0) {
      setError("No valid email addresses found.");
    }
    setFileName(name);
    setResult(r);
    props.onChange(r);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) {
      setError("File is larger than 5 MB.");
      return;
    }
    handle(await f.text(), f.name);
  }

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">Recipients</label>

      <div className="mt-2 flex gap-3">
        <input ref={inputRef} type="file" accept=".csv,.txt" onChange={onFile} className="hidden" />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Upload CSV or TXT
        </button>
        {fileName && <span className="self-center text-sm text-slate-500">{fileName}</span>}
      </div>

      <p className="mt-3 text-xs text-slate-500">Or paste addresses directly:</p>
      <textarea
        value={pasted}
        onChange={(e) => { setPasted(e.target.value); handle(e.target.value, null); }}
        rows={3}
        placeholder="alice@example.com, bob@example.com"
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
      />

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {result && result.valid.length > 0 && (
        <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
          <p className="font-medium text-slate-900">{result.valid.length} valid recipients</p>
          {(result.duplicates > 0 || result.invalid.length > 0) && (
            <p className="mt-1 text-xs text-slate-500">
              {result.duplicates > 0 && result.duplicates + " duplicate(s) removed. "}
              {result.invalid.length > 0 && result.invalid.length + " malformed entr(ies) skipped."}
            </p>
          )}
          <p className="mt-2 truncate text-xs text-slate-400">
            {result.valid.slice(0, 4).join(", ")}
            {result.valid.length > 4 ? " ..." : ""}
          </p>
        </div>
      )}
    </div>
  );
}
