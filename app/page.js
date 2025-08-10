'use client';
import { useState } from 'react';
import ContactSearch from '../components/ContactSearch';
import ChatBox from '../components/ChatBox';

export default function HomePage() {
  const [contact, setContact] = useState(null);

  return (
    <main className="mx-auto max-w-5xl p-6 space-y-6">
      <h1 className="text-2xl font-semibold">CRM Chat</h1>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-gray-700">Select a contact</h2>
        <ContactSearch onSelect={setContact} />
      </section>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {/* Contact card (right column on desktop) */}
        <section className="md:col-span-1 space-y-2">
          {contact ? (
            <div className="rounded-xl border p-4 bg-white space-y-1">
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
          ) : (
            <div className="rounded-xl border p-4 bg-white text-sm text-gray-500">
              No contact selected yet.
            </div>
          )}
        </section>

        {/* Chat area (always visible) */}
        <section className="md:col-span-2">
          <ChatBox contact={contact} />
        </section>
      </div>
    </main>
  );
}