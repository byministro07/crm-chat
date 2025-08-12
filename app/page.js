'use client';

import { useState, useEffect } from 'react';
import ContactSearch from '@/components/ContactSearch';
import ChatBox from '@/components/ChatBox';
import SessionsSidebar from '@/components/SessionsSidebar';
import styles from './page.module.css';

export default function Home() {
  const [selectedContact, setSelectedContact] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const [thinkHarder, setThinkHarder] = useState(false);
  const [showContactSearch, setShowContactSearch] = useState(false);
  const [customerStatus, setCustomerStatus] = useState(null);
  const [statusLoading, setStatusLoading] = useState(false);

  // Load session from window if exists
  useEffect(() => {
    if (typeof window !== 'undefined' && window.__SESSION_ID) {
      setSessionId(window.__SESSION_ID);
      // Load the contact for this session
      loadSessionContact(window.__SESSION_ID);
    }
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (showContactSearch && !e.target.closest(`.${styles.searchDropdown}`) && 
          !e.target.closest(`.${styles.searchButton}`)) {
        setShowContactSearch(false);
      }
    };
    
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showContactSearch]);

  const loadSessionContact = async (sessionId) => {
    try {
      const res = await fetch(`/api/chat/session/messages?sessionId=${sessionId}`);
      const data = await res.json();
      if (data.session?.contact_id) {
        // Get full contact details
        const contactRes = await fetch(`/api/contacts/${data.session.contact_id}`);
        if (contactRes.ok) {
          const contact = await contactRes.json();
          setSelectedContact(contact);
        }
      }
    } catch (err) {
      console.error('Error loading session contact:', err);
    }
  };

  const analyzeCustomerStatus = async (contactId, sessionId) => {
    setStatusLoading(true);
    try {
      const res = await fetch('/api/analyze-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId, sessionId })
      });
      
      if (res.ok) {
        const data = await res.json();
        setCustomerStatus(data.status);
      }
    } catch (err) {
      console.error('Error analyzing status:', err);
      setCustomerStatus('UNSURE');
    } finally {
      setStatusLoading(false);
    }
  };

  const handleContactSelect = async (contact) => {
    setSelectedContact(contact);
    setShowContactSearch(false);
    // Don't create session yet - wait for first message
    setSessionId(null);
    setCustomerStatus(null);  // Reset status
    if (typeof window !== 'undefined') {
      delete window.__SESSION_ID;
    }
    // Analyze status for new contact
    await analyzeCustomerStatus(contact.id, null);
  };

  const handleSessionSelect = async (newSessionId) => {
    setSessionId(newSessionId);
    if (typeof window !== 'undefined') {
      window.__SESSION_ID = newSessionId;
    }
    await loadSessionContact(newSessionId);
  };

  const handleNewChat = () => {
    setSelectedContact(null);
    setSessionId(null);
    setShowContactSearch(false);
    setThinkHarder(false);  // Add this line to reset to Flash
    if (typeof window !== 'undefined') {
      delete window.__SESSION_ID;
    }
  };

  // This will be called by ChatBox when first message is sent
  const handleSessionCreated = (newSessionId) => {
    setSessionId(newSessionId);
    if (typeof window !== 'undefined') {
      window.__SESSION_ID = newSessionId;
    }
  };

  const handleMessageSent = async () => {
    // Re-analyze status after sending first message in existing session
    if (sessionId && selectedContact) {
      await analyzeCustomerStatus(selectedContact.id, sessionId);
    }
  };

  return (
    <div className={styles.container}>
      {/* Sidebar Overlay for mobile */}
      {showSidebar && (
        <div 
          className={styles.sidebarOverlay} 
          onClick={() => setShowSidebar(false)}
        />
      )}
      
      {/* Sidebar */}
      <div className={`${styles.sidebar} ${showSidebar ? styles.sidebarOpen : ''}`}>
        <SessionsSidebar
          currentSessionId={sessionId}
          onSessionSelect={handleSessionSelect}
          onNewChat={handleNewChat}
          onClose={() => setShowSidebar(false)}
        />
      </div>

      {/* Main Content - shifts when sidebar opens */}
      <div className={`${styles.main} ${showSidebar ? styles.mainWithSidebar : ''}`}>
        {/* Header */}
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <button
              className={styles.menuButton}
              onClick={() => setShowSidebar(!showSidebar)}
              aria-label="Toggle sidebar"
              title="Show chat history"
            >
              {/* Split screen icon */}
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <rect x="3" y="4" width="6" height="12" rx="1" stroke="currentColor" strokeWidth="1.5"/>
                <rect x="11" y="4" width="6" height="12" rx="1" stroke="currentColor" strokeWidth="1.5" fill="currentColor" opacity="0.2"/>
              </svg>
            </button>

            <button
              className={styles.newChatButton}
              onClick={handleNewChat}
              aria-label="New chat"
            >
              {/* Pencil/Edit icon */}
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M12.854 0.146a0.5 0.5 0 0 1 0.707 0l2.293 2.293a0.5 0.5 0 0 1 0 0.707l-9 9a0.5 0.5 0 0 1-0.253 0.143l-4 1a0.5 0.5 0 0 1-0.609-0.609l1-4a0.5 0.5 0 0 1 0.143-0.253l9-9z" stroke="currentColor" strokeWidth="1.2"/>
              </svg>
              <span>New chat</span>
            </button>
          </div>

          <div className={styles.headerCenter}>
            {selectedContact ? (
              <>
                <span className={styles.contactName}>{selectedContact.name || 'Unknown'}</span>
                <span className={styles.contactEmail}>{selectedContact.email}</span>
                
                {/* Status Pill */}
                <div className={styles.statusPill}>
                  {statusLoading ? (
                    <div className={styles.statusLoading}>
                      <div className={styles.spinner}></div>
                    </div>
                  ) : customerStatus ? (
                    <div className={`${styles.statusContent} ${styles[`status${customerStatus}`]}`}>
                      <span className={styles.statusIcon}>
                        {customerStatus === 'PAID' && '$'}
                        {customerStatus === 'ACTIVE' && '✓'}
                        {customerStatus === 'DORMANT' && 'zzz'}
                        {customerStatus === 'UNSURE' && '?'}
                      </span>
                      <span className={styles.statusText}>
                        {customerStatus.charAt(0) + customerStatus.slice(1).toLowerCase()}
                      </span>
                    </div>
                  ) : null}
                </div>
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
          ) : (
            <ChatBox
              contactId={selectedContact.id}
              sessionId={sessionId}
              modelTier={thinkHarder ? 'high' : 'medium'}
              thinkHarder={thinkHarder}
              setThinkHarder={setThinkHarder}
              selectedContact={selectedContact}
              onSessionCreated={handleSessionCreated}
              onMessageSent={handleMessageSent}  // Add this
            />
          )}
        </main>
      </div>
    </div>
  );
}