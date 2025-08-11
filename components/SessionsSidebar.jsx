// components/SessionsSidebar.jsx
'use client';

import { useState, useEffect } from 'react';
import styles from './SessionsSidebar.module.css';

export default function SessionsSidebar({ 
  currentSessionId, 
  onSessionSelect, 
  onNewChat,
  onClose 
}) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSessions();
    // Set up polling for new sessions
    const interval = setInterval(fetchSessions, 5000);
    return () => clearInterval(interval);
  }, [currentSessionId]);

  const fetchSessions = async () => {
    try {
      // Always fetch ALL sessions, no filtering
      const res = await fetch('/api/chat/sessions');
      const data = await res.json();
      setSessions(data.sessions || []);
      setLoading(false);
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else if (date > new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)) {
      return date.toLocaleDateString('en-US', { weekday: 'short' });
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  // Extract title description (remove contact name if it's in the title)
  const getSessionDescription = (session) => {
    if (!session.title) return 'New conversation';
    
    const contactName = session.contacts?.name;
    if (contactName && session.title.startsWith(contactName)) {
      // Remove contact name and dash from title
      return session.title.replace(`${contactName} - `, '').trim();
    }
    return session.title;
  };

  if (loading) {
    return (
      <div className={styles.sidebar}>
        <div className={styles.header}>
          <h3>Chat History</h3>
        </div>
        <div className={styles.loading}>Loading sessions...</div>
      </div>
    );
  }

  return (
    <div className={styles.sidebar}>
      <div className={styles.header}>
        <h3>Chat History</h3>
        <button 
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Close sidebar"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <div className={styles.sessionsList}>
        {sessions.length === 0 ? (
          <div className={styles.empty}>No chat sessions yet</div>
        ) : (
          sessions.map(session => (
            <button
              key={session.id}
              className={`${styles.sessionItem} ${
                session.id === currentSessionId ? styles.active : ''
              }`}
              onClick={() => {
                onSessionSelect(session.id);
                if (window.innerWidth < 768) {
                  onClose?.();
                }
              }}
            >
              <div className={styles.sessionContent}>
                <div className={styles.sessionTitle}>
                  {session.contacts?.name || 'Unknown Contact'}
                </div>
                <div className={styles.sessionDescription}>
                  {getSessionDescription(session)}
                </div>
                <div className={styles.sessionMeta}>
                  {formatDate(session.updated_at)}
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}