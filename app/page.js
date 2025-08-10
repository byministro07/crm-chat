// app/page.js
'use client';

import { useState, useEffect } from 'react';
import ContactSearch from '@/components/ContactSearch';
import ChatBox from '@/components/ChatBox';
import ModelPicker from '@/components/ModelPicker';
import SessionsSidebar from '@/components/SessionsSidebar';
import styles from './page.module.css';

export default function Home() {
  const [selectedContact, setSelectedContact] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [modelTier, setModelTier] = useState('medium');
  const [showSidebar, setShowSidebar] = useState(true);
  const [loading, setLoading] = useState(false);

  // Load session from window if exists
  useEffect(() => {
    if (typeof window !== 'undefined' && window.__SESSION_ID) {
      setSessionId(window.__SESSION_ID);
    }
  }, []);

  const createNewSession = async (contactId) => {
    if (!contactId) return;
    
    setLoading(true);
    try {
      const res = await fetch('/api/chat/session/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          contactId,
          title: `Chat - ${new Date().toLocaleDateString()}`,
          modelTier 
        })
      });

      if (!res.ok) throw new Error('Failed to create session');

      const data = await res.json();
      setSessionId(data.sessionId);
      
      if (typeof window !== 'undefined') {
        window.__SESSION_ID = data.sessionId;
      }
    } catch (err) {
      console.error('Error creating session:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleContactSelect = async (contact) => {
    setSelectedContact(contact);
    await createNewSession(contact.id);
  };

  const handleSessionSelect = async (newSessionId) => {
    setSessionId(newSessionId);
    if (typeof window !== 'undefined') {
      window.__SESSION_ID = newSessionId;
    }

    // Load session details to get contact
    try {
      const res = await fetch(`/api/chat/session/messages?sessionId=${newSessionId}`);
      const data = await res.json();
      if (data.session?.contact_id) {
        // Optionally fetch full contact details
        setSelectedContact({ id: data.session.contact_id });
      }
    } catch (err) {
      console.error('Error loading session:', err);
    }
  };

  const handleNewChat = () => {
    setSelectedContact(null);
    setSessionId(null);
    if (typeof window !== 'undefined') {
      delete window.__SESSION_ID;
    }
  };

  return (
    <div className={styles.container}>
      {showSidebar && (
        <SessionsSidebar
          currentSessionId={sessionId}
          onSessionSelect={handleSessionSelect}
          contactId={selectedContact?.id}
          onNewChat={handleNewChat}
        />
      )}

      <div className={styles.mainContent}>
        <header className={styles.header}>
          <button
            className={styles.sidebarToggle}
            onClick={() => setShowSidebar(!showSidebar)}
            title={showSidebar ? 'Hide sidebar' : 'Show sidebar'}
          >
            {showSidebar ? '◀' : '▶'}
          </button>

          <h1 className={styles.title}>CRM Chat</h1>

          <div className={styles.headerControls}>
            <ModelPicker
              value={modelTier}
              onChange={setModelTier}
            />
            
            <button
              className={styles.newChatButton}
              onClick={handleNewChat}
              disabled={!selectedContact}
            >
              New Chat
            </button>
          </div>
        </header>

        <div className={styles.searchSection}>
          <ContactSearch onSelect={handleContactSelect} />
          {selectedContact && (
            <div className={styles.selectedContact}>
              <span className={styles.contactName}>
                {selectedContact.name || selectedContact.email}
              </span>
              {selectedContact.company && (
                <span className={styles.contactCompany}>
                  {selectedContact.company}
                </span>
              )}
            </div>
          )}
        </div>

        <main className={styles.chatSection}>
          {!selectedContact ? (
            <div className={styles.emptyState}>
              <h2>Welcome to CRM Chat</h2>
              <p>Search and select a customer above to start a conversation</p>
              <p className={styles.hint}>
                💡 Ask questions about orders, shipping, messages, or get summaries
              </p>
            </div>
          ) : loading ? (
            <div className={styles.loading}>Creating session...</div>
          ) : (
            <ChatBox
              contactId={selectedContact.id}
              sessionId={sessionId}
              modelTier={modelTier}
            />
          )}
        </main>

        <footer className={styles.footer}>
          <div className={styles.stats}>
            Model: {modelTier} | 
            Session: {sessionId ? sessionId.substring(0, 8) : 'none'}
          </div>
        </footer>
      </div>
    </div>
  );
}