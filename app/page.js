'use client';
import { useState } from 'react';

import ContactSearch from '../components/ContactSearch';
import ChatBox from '../components/ChatBox';
import ModelPicker from '../components/ModelPicker';

export default function HomePage() {
  const [contact, setContact] = useState(null);
  const [tier, setTier] = useState('light');
  const [chatKey, setChatKey] = useState(0);

  const newChat = () => setChatKey(k => k + 1);

  return (
    <main className="mx-auto max-w-4xl p-6 space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h1 className="text-2xl font-semibold">CRM Chat</h1>
        <div className="flex items-center gap-3">
          <ModelPicker value={tier} onChange={setTier} />
          <button
            onClick={newChat}
            className="rounded-full border px-3 py-1 bg-white hover:bg-gray-50"
          >
            New chat
          </button>
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-gray-700">Select a contact</h2>
        <ContactSearch onSelect={setContact} />
      </section>

      <section>
        <ChatBox contact={contact} tier={tier} chatKey={chatKey} />
      </section>
    </main>
  );
}