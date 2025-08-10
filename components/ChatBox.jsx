'use client';
import { useEffect, useRef, useState } from 'react';

export default function ChatBox({ contact, tier, chatKey }) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  // Focus on mount / when new chat / when contact changes
  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { setMessages([]); setInput(''); inputRef.current?.focus(); }, [chatKey]);
  useEffect(() => { inputRef.current?.focus(); }, [contact]);

  const canSend = !!contact && input.trim() && !busy;

  function metaLabel(meta) {
    if (!meta?.model) return '';
    if (meta.model.startsWith('tool:db')) return 'from database';
    return `via ${meta.model} (${tier})`;
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
      setMessages(m => [...m, { role: 'assistant', text: data.answer, meta: { model: data.model } }]);
    } catch (e) {
      setMessages(m => [...m, { role: 'assistant', text: `Error: ${e.message}` }]);
    } finally {
      setBusy(false);
      inputRef.current?.focus(); // keep cursor ready
    }
  }

  return (
    <div className="space-y-3">
      {!contact && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-2 text-xs text-yellow-700">
          Select a contact above to enable grounded answers (shipping, totals, tracking).
        </div>
      )}

      <div className="min-h-[16rem] space-y-3">
        {messages.length === 0 && (
          <div className="text-sm text-gray-500">Ask something to get started.</div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'text-right' : 'text-left'}>
            <div className={`inline-block max-w-[90%] whitespace-pre-wrap rounded-2xl px-3 py-2 ${
              m.role === 'user' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-900'
            }`}>
              {m.text}
            </div>
            {m.role === 'assistant' && m.meta?.model && (
              <div className="mt-1 text-xs text-gray-500">{metaLabel(m.meta)}</div>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          ref={inputRef}
          autoFocus
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => (e.key === 'Enter' && !e.shiftKey ? (e.preventDefault(), send()) : null)}
          placeholder={contact ? 'Type your question…' : 'Select a contact first'}
          disabled={!contact || busy}
          className="flex-1 rounded-full border px-4 py-2 bg-white"
        />
        <button
          onClick={send}
          disabled={!canSend}
          className="rounded-full bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}