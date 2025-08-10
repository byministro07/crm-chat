'use client';
import { useState } from 'react';
import ContactSearch from '../components/ContactSearch';
import ChatBox from '../components/ChatBox';
import ModelPicker from '../components/ModelPicker';

export default function HomePage() {
  const [contact, setContact] = useState(null);
  const [tier, setTier] = useState('light');
  const [chatKey, setChatKey] = useState(0); // increments to clear ChatBox UI

  async function startSession(c = contact) {
    if (!c) return;
    try {
      const res = await fetch('/api/chat/session/new', { /* ... */ });
const text = await res.text();
let data;
try { data = JSON.parse(text); } catch { data = { raw: text }; }

if (!res.ok) throw new Error(data?.error || data?.raw || `HTTP ${res.status}`);
window.__SESSION_ID = data.sessionId;
setChatKey(k => k + 1);
    } catch (e) {
      alert(`Could not start chat: ${e.message}`);
    }
  }

  const handleSelect = async (c) => {
    setContact(c);
    await startSession(c); // auto start a fresh session when selecting a contact
  };

  return (
    <main className="mx-auto max-w-4xl p-6 space-y-5">
      {/* Top bar */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h1 className="text-2xl font-semibold">CRM Chat</h1>
        <div className="flex items-center gap-3">
          <ModelPicker value={tier} onChange={setTier} />
          <button
            onClick={() => startSession()}
            className="rounded-full border px-3 py-1 bg-white hover:bg-gray-50"
            title="Start a new chat"
          >
            New chat
          </button>
        </div>
      </div>

      {/* Contact selector */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium text-gray-700">Select a contact</h2>
        <ContactSearch onSelect={handleSelect} />
      </section>

      {/* Chat area */}
      <section>
        <ChatBox contact={contact} tier={tier} chatKey={chatKey} />
      </section>
    </main>
  );
}