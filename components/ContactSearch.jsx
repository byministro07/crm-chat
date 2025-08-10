'use client';
import { useEffect, useRef, useState } from 'react';

export default function ContactSearch({ onSelect }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const timerRef = useRef();

  useEffect(() => {
    if (!q) { setResults([]); setOpen(false); return; }
    setLoading(true); setError(null);
    clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/contacts/search?q=${encodeURIComponent(q)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setResults(data); setOpen(true);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }, 250); // debounce

    return () => clearTimeout(timerRef.current);
  }, [q]);

  return (
    <div className="relative w-full max-w-xl">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
        placeholder="Search by name or email"
        className="w-full rounded-xl border border-gray-300 px-4 py-2 focus:outline-none focus:ring"
      />
      {(open && (results.length || loading || error)) && (
        <div className="absolute z-10 mt-1 w-full rounded-xl border bg-white shadow">
          {loading && <div className="p-3 text-sm text-gray-500">Searching…</div>}
          {error && <div className="p-3 text-sm text-red-600">{error}</div>}
          {results.map(r => (
            <button
              key={r.id}
              onClick={() => { setQ(`${r.name} <${r.email || 'no email'}>`); setOpen(false); onSelect?.(r); }}
              className="block w-full px-4 py-2 text-left hover:bg-gray-50"
            >
              <div className="font-medium">{r.name}</div>
              <div className="text-xs text-gray-500">
                {r.email || '—'} {r.company ? `· ${r.company}` : ''}
              </div>
            </button>
          ))}
          {!loading && !error && results.length === 0 && (
            <div className="p-3 text-sm text-gray-500">No matches</div>
          )}
        </div>
      )}
    </div>
  );
}