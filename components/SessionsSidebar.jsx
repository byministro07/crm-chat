// Replace the entire component with this:
'use client';

import { useState, useEffect } from 'react';
import styles from './SessionsSidebar.module.css';

export default function SessionsSidebar({ 
  currentSessionId, 
  onSessionSelect, 
  contactId,
  onNewChat,
  onClose 
}) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSessions();
  }, [contactId, currentSessionId]);

  const fetchSessions = async () => {
    try {
      setLoading(true);
      const params = contactId ? `?contactId=${contactId}` : '';
      const res = await fetch(`/api/chat/sessions${params}`);
      const data = await res.json();
      setSessions(data.sessions || []);
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
    } finally {
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

  const generateTitle = (session) => {
    if (session.title) return session.title;
    const contact = session.contacts;
    return `${contact?.name || 'Unknown'} - ${formatDate(session.created_at)}`;
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
                onClose?.();
              }}
            >
              <div className={styles.sessionContent}>
                <div className={styles.sessionTitle}>
                  {generateTitle(session)}
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