'use client';
import { useState } from 'react';
import ContactSearch from '../components/ContactSearch';

export default function HomePage() {
  const [contact, setContact] = useState(null);

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-6">
      <h1 className="text-2xl font-semibold">CRM Chat</h1>
      <ContactSearch onSelect={setContact} />

      {contact && (
        <div className="rounded-xl border p-4">
          <div className="font-semibold">{contact.name}</div>
          <div className="text-sm text-gray-600">
            {contact.email || '—'} {contact.company ? `· ${contact.company}` : ''}
          </div>
          {contact.last_activity_at && (
            <div className="text-xs text-gray-500">
              Last activity: {new Date(contact.last_activity_at).toLocaleString()}
            </div>
          )}
        </div>
      )}
    </main>
  );
}