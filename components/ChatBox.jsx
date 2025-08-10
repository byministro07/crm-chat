'use client';
import { useState } from 'react';

const TIERS = [
  { key: 'light', label: 'Light' },
  { key: 'medium', label: 'Medium' },
  { key: 'high', label: 'High' },
];

export default function ChatBox({ contact }) {
  const [tier, setTier] = useState('light');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);

  const canSend = !!contact && input.trim() && !busy;

  function newChat() {
    setMessages([]);
    setInput('');
  }

  function metaLabel(meta) {
    if (!meta?.model) return '';
    if (meta.model.startsWith('tool:db')) return 'from database';
    // show underlying model + tier used
    return `via ${meta.model} (${meta.tier ?? tier})`;
  }

  async function send() {
    if (!canSend) return;
    const q = input.trim();
    setInput('');
    setMessages(m => [...m, { role: 'user', text: q }]);
    setBusy(true);
    try {
      const res = await fetch('/api/chat/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: contact.id, question: q, tier }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setMessages(m => [...m, { role: 'assistant', text: data.answer, meta: { model: data.model, tier } }]);
    } catch (e) {
      setMessages(m => [...m, { role: 'assistant', text: `Error: ${e.message}` }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Top controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          {TIERS.map(t => (
            <button
              key={t.key}
              onClick={() => setTier(t.key)}
              className={`rounded-full border px-3 py-1 text-sm ${tier===t.key ? 'bg-black text-white' : 'bg-white'}`}
              title={`Use ${t.label} model`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          onClick={newChat}
          className="ml-auto rounded-full border px-3 py-1 text-sm bg-white hover:bg-gray-50"
          title="Start a new chat"
        >
          New chat
        </button>
      </div>

      {/* Banner if no contact yet */}
      {!contact && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Select a contact to ask grounded questions (shipping, totals, tracking).  
          You can still type here, but the Send button is disabled until a contact is selected.
        </div>
      )}

      {/* Messages */}
      <div className="rounded-xl border p-3 h-64 overflow-auto bg-white">
        {messages.length === 0 && (
          <div className="text-sm text-gray-500">Ask something to get started.</div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`mb-3 ${m.role === 'user' ? 'text-right' : 'text-left'}`}>
            <div className={`inline-block max-w-[90%] rounded-xl px-3 py-2 ${m.role === 'user' ? 'bg-blue-100' : 'bg-gray-100'}`}>
              <div className="whitespace-pre-wrap">{m.text}</div>
            </div>
            {m.role === 'assistant' && m.meta?.model && (
              <div className="mt-1 text-xs text-gray-500">{metaLabel(m.meta)}</div>
            )}
          </div>
        ))}
      </div>

      {/* Input row */}
      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => (e.key === 'Enter' && !e.shiftKey ? (e.preventDefault(), send()) : null)}
          placeholder={contact ? 'Type your question…' : 'Select a contact first'}
          disabled={!contact || busy}
          className="flex-1 rounded-xl border px-4 py-2 bg-white"
        />
        <button
          onClick={send}
          disabled={!canSend}
          className="rounded-xl bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}