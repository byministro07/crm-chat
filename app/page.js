'use client';
import { useState } from 'react';
import ContactSearch from '../components/ContactSearch';
import ChatBox from '../components/ChatBox';

export default function HomePage() {
  const [contact, setContact] = useState(null);

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-6">
      <h1 className="text-2xl font-semibold">CRM Chat</h1>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-gray-700">Select a contact</h2>
        <ContactSearch onSelect={setContact} />
      </section>

      {contact && (
        <section className="space-y-2">
          <div className="rounded-xl border p-4 bg-white">
            <div className="font-semibold">{contact.name}</div>
            <div className="text-sm text-gray-600">
              {contact.email || '—'} {contact.company ? `· ${contact.company}` : ''}
            </div>
          </div>
          <ChatBox contact={contact} />
        </section>
      )}
    </main>
  );
}