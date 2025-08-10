// components/SessionsSidebar.jsx
'use client';

import { useState, useEffect } from 'react';
import styles from './SessionsSidebar.module.css';

export default function SessionsSidebar({ 
  currentSessionId, 
  onSessionSelect, 
  contactId,
  onNewChat 
}) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');

  useEffect(() => {
    fetchSessions();
  }, [contactId]);

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

  const handleRename = async (sessionId) => {
    if (!editTitle.trim()) {
      setEditingId(null);
      return;
    }

    try {
      const res = await fetch('/api/chat/sessions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, title: editTitle })
      });

      if (res.ok) {
        await fetchSessions();
        setEditingId(null);
        setEditTitle('');
      }
    } catch (err) {
      console.error('Failed to rename session:', err);
    }
  };

  const handleDelete = async (sessionId) => {
    if (!confirm('Delete this chat session?')) return;

    try {
      const res = await fetch(`/api/chat/sessions?sessionId=${sessionId}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        if (sessionId === currentSessionId) {
          onNewChat(); // Create new session if deleting current
        }
        await fetchSessions();
      }
    } catch (err) {
      console.error('Failed to delete session:', err);
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
          <h3>Chat Sessions</h3>
        </div>
        <div className={styles.loading}>Loading...</div>
      </div>
    );
  }

  return (
    <div className={styles.sidebar}>
      <div className={styles.header}>
        <h3>Chat Sessions</h3>
        <button 
          className={styles.newButton}
          onClick={onNewChat}
          title="New Chat"
        >
          +
        </button>
      </div>

      <div className={styles.sessionsList}>
        {sessions.length === 0 ? (
          <div className={styles.empty}>No sessions yet</div>
        ) : (
          sessions.map(session => (
            <div
              key={session.id}
              className={`${styles.sessionItem} ${
                session.id === currentSessionId ? styles.active : ''
              }`}
            >
              {editingId === session.id ? (
                <input
                  type="text"
                  className={styles.editInput}
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onBlur={() => handleRename(session.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRename(session.id);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  autoFocus
                />
              ) : (
                <div
                  className={styles.sessionContent}
                  onClick={() => onSessionSelect(session.id)}
                >
                  <div className={styles.sessionTitle}>
                    {generateTitle(session)}
                  </div>
                  <div className={styles.sessionMeta}>
                    {session.contacts?.name} • {formatDate(session.updated_at)}
                  </div>
                </div>
              )}

              <div className={styles.sessionActions}>
                <button
                  className={styles.actionBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingId(session.id);
                    setEditTitle(session.title || generateTitle(session));
                  }}
                  title="Rename"
                >
                  ✏️
                </button>
                <button
                  className={styles.actionBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(session.id);
                  }}
                  title="Delete"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}