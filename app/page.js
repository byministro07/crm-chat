// app/page.js
'use client';

import { useState, useEffect } from 'react';
import ContactSearch from '@/components/ContactSearch';
import ChatBox from '@/components/ChatBox';
import SessionsSidebar from '@/components/SessionsSidebar';
import styles from './page.module.css';

export default function Home() {
  const [selectedContact, setSelectedContact] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [showSidebar, setShowSidebar] = useState(false); // Default closed
  const [loading, setLoading] = useState(false);
  const [thinkHarder, setThinkHarder] = useState(false);
  const [showContactSearch, setShowContactSearch] = useState(false);

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
          modelTier: thinkHarder ? 'high' : 'medium'
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
    setShowContactSearch(false);
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
        setSelectedContact({ id: data.session.contact_id });
      }
    } catch (err) {
      console.error('Error loading session:', err);
    }
  };

  const handleNewChat = () => {
    setSelectedContact(null);
    setSessionId(null);
    setShowContactSearch(false);
    if (typeof window !== 'undefined') {
      delete window.__SESSION_ID;
    }
  };

  return (
    <div className={styles.container}>
      {/* Sidebar */}
      <div className={`${styles.sidebar} ${showSidebar ? styles.sidebarOpen : ''}`}>
        <SessionsSidebar
          currentSessionId={sessionId}
          onSessionSelect={handleSessionSelect}
          contactId={selectedContact?.id}
          onNewChat={handleNewChat}
        />
      </div>

      {/* Main Content */}
      <div className={styles.main}>
        {/* Header */}
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <button
              className={styles.menuButton}
              onClick={() => setShowSidebar(!showSidebar)}
              aria-label="Toggle sidebar"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M2.5 7.5H17.5M2.5 12.5H17.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>

            <button
              className={styles.newChatButton}
              onClick={handleNewChat}
              aria-label="New chat"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M10 3V17M3 10H17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <span>New chat</span>
            </button>
          </div>

          <div className={styles.headerCenter}>
            {selectedContact ? (
              <>
                <span className={styles.contactName}>{selectedContact.name || 'Unknown'}</span>
                <span className={styles.contactEmail}>{selectedContact.email}</span>
              </>
            ) : (
              <span className={styles.selectPrompt}>Select a customer</span>
            )}
          </div>

          <div className={styles.headerRight}>
            <button
              className={styles.searchButton}
              onClick={() => setShowContactSearch(!showContactSearch)}
              aria-label="Search contacts"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M13 13L17 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          {/* Contact Search Dropdown */}
          {showContactSearch && (
            <div className={styles.searchDropdown}>
              <ContactSearch 
                onSelect={handleContactSelect}
                autoFocus={true}
                showRecent={true}
              />
            </div>
          )}
        </header>

        {/* Chat Area */}
        <main className={styles.chatArea}>
          {!selectedContact ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>💬</div>
              <h2>Start a conversation</h2>
              <p>Click the search icon above to find a customer</p>
            </div>
          ) : loading ? (
            <div className={styles.loadingState}>
              <div className={styles.spinner}></div>
              <p>Setting up chat...</p>
            </div>
          ) : (
            <ChatBox
              contactId={selectedContact.id}
              sessionId={sessionId}
              modelTier={thinkHarder ? 'high' : 'medium'}
              thinkHarder={thinkHarder}
              setThinkHarder={setThinkHarder}
              selectedContact={selectedContact}
            />
          )}
        </main>
      </div>
    </div>
  );
}