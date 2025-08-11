'use client';
import { useEffect, useRef, useState } from 'react';
import styles from './ContactSearch.module.css';

export default function ContactSearch({ onSelect, autoFocus = false, showRecent = false }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [recentContacts, setRecentContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const timerRef = useRef();
  const inputRef = useRef();

  // Focus input when component mounts if autoFocus is true
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  // Fetch recent contacts on mount if showRecent is true
  useEffect(() => {
    if (showRecent && !q) {
      fetchRecentContacts();
    }
  }, [showRecent]);

  const fetchRecentContacts = async () => {
    setLoading(true);
    try {
      // Fetch all contacts and sort by last_activity_at
      const res = await fetch(`/api/contacts/search?q=&limit=20`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRecentContacts(data);
      setResults(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!q && showRecent) {
      setResults(recentContacts);
      return;
    }
    
    if (!q) {
      setResults([]);
      return;
    }

    setLoading(true);
    setError(null);
    clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/contacts/search?q=${encodeURIComponent(q)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setResults(data);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timerRef.current);
  }, [q, showRecent, recentContacts]);

  const handleSelect = (contact) => {
    setQ('');
    onSelect?.(contact);
  };

  return (
    <div className={styles.container}>
      <div className={styles.searchInputWrapper}>
        <svg className={styles.searchIcon} width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M11 11L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name or email"
          className={styles.searchInput}
        />
      </div>
      
      <div className={styles.resultsContainer}>
        {loading && (
          <div className={styles.loading}>
            <span className={styles.loadingDot}></span>
            <span className={styles.loadingDot}></span>
            <span className={styles.loadingDot}></span>
          </div>
        )}
        
        {error && (
          <div className={styles.error}>Error: {error}</div>
        )}
        
        {!loading && !error && results.length === 0 && q && (
          <div className={styles.noResults}>No contacts found</div>
        )}
        
        {!loading && !error && results.length === 0 && !q && showRecent && (
          <div className={styles.noResults}>No recent contacts</div>
        )}
        
        {!loading && !error && results.length > 0 && (
          <>
            {!q && showRecent && (
              <div className={styles.sectionLabel}>Recent Contacts</div>
            )}
            <div className={styles.resultsList}>
              {results.map(contact => (
                <button
                  key={contact.id}
                  onClick={() => handleSelect(contact)}
                  className={styles.resultItem}
                >
                  <div className={styles.contactInfo}>
                    <div className={styles.contactName}>{contact.name || 'Unknown'}</div>
                    <div className={styles.contactMeta}>
                      {contact.email || 'No email'}
                      {contact.company && ` • ${contact.company}`}
                    </div>
                  </div>
                  {contact.last_activity_at && (
                    <div className={styles.lastActivity}>
                      {new Date(contact.last_activity_at).toLocaleDateString()}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}