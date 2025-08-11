'use client';

import { useState, useEffect, useRef } from 'react';
import styles from './ChatBox.module.css';

export default function ChatBox({ 
  contactId, 
  sessionId, 
  modelTier, 
  thinkHarder, 
  setThinkHarder,
  selectedContact,
  onSessionCreated 
}) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState(sessionId);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Load messages if we have a session
  useEffect(() => {
    if (sessionId) {
      setCurrentSessionId(sessionId);
      loadMessages(sessionId);
    } else {
      setMessages([]);
      setCurrentSessionId(null);
    }
  }, [sessionId]);

  // Auto-focus input
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [selectedContact]);

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadMessages = async (sessionId) => {
    try {
      const res = await fetch(`/api/chat/session/messages?sessionId=${sessionId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch (err) {
      console.error('Failed to load messages:', err);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || !contactId || loading) return;

    const userMessage = input.trim();
    setInput('');
    setLoading(true);

    // Add user message to UI immediately
    const tempUserMessage = {
      role: 'user',
      content: userMessage,
      created_at: new Date().toISOString()
    };
    setMessages(prev => [...prev, tempUserMessage]);

    try {
      // Create session if needed (only on first message)
      let activeSessionId = currentSessionId;
      if (!activeSessionId) {
        const sessionRes = await fetch('/api/chat/session/new', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contactId,
            firstMessage: userMessage,
            modelTier: thinkHarder ? 'high' : 'medium'
          })
        });

        if (sessionRes.ok) {
          const sessionData = await sessionRes.json();
          activeSessionId = sessionData.sessionId;
          setCurrentSessionId(activeSessionId);
          onSessionCreated?.(activeSessionId);
        }
      }

      // Send the message
      const res = await fetch('/api/chat/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId,
          question: userMessage,
          tier: thinkHarder ? 'high' : 'medium',
          sessionId: activeSessionId
        })
      });

      if (!res.ok) throw new Error('Failed to send message');

      const data = await res.json();
      
      // Add assistant response
      const assistantMessage = {
        role: 'assistant',
        content: data.answer,
        created_at: new Date().toISOString(),
        model: data.model
      };
      setMessages(prev => [...prev, assistantMessage]);

      // Reset Think Harder after each message
      if (thinkHarder) {
        setThinkHarder(false);
      }
    } catch (err) {
      console.error('Failed to send message:', err);
      // Add error message
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        created_at: new Date().toISOString(),
        isError: true
      }]);
    } finally {
      setLoading(false);
      // Re-focus input
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={styles.container}>
      {/* Messages Area */}
      <div className={styles.messagesContainer}>
        {messages.length === 0 ? (
          <div className={styles.emptyMessages}>
            <p>Start a conversation with {selectedContact?.name || 'this customer'}</p>
            <p className={styles.hint}>Ask about orders, shipping, or customer history</p>
          </div>
        ) : (
          <div className={styles.messagesList}>
            {messages.map((message, index) => (
              <div
                key={index}
                className={`${styles.messageWrapper} ${
                  message.role === 'user' ? styles.userMessage : styles.assistantMessage
                }`}
              >
                <div className={styles.message}>
                  <div className={styles.messageContent}>
                    {message.content}
                  </div>
                  {message.role === 'assistant' && message.model && (
                    <div className={styles.messageModel}>
                      {message.model}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className={styles.messageWrapper}>
                <div className={styles.loadingMessage}>
                  <span className={styles.dot}></span>
                  <span className={styles.dot}></span>
                  <span className={styles.dot}></span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className={styles.inputContainer}>
        <div className={styles.inputWrapper}>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={contactId ? "Type your message..." : "Select a contact first"}
            disabled={!contactId || loading}
            className={styles.input}
          />
          
          <button
            className={`${styles.thinkButton} ${thinkHarder ? styles.thinkActive : ''}`}
            onClick={() => setThinkHarder(!thinkHarder)}
            disabled={!contactId}
            title="Use advanced model for this message"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 1C6.5 1 5.5 2 5.5 3.5C5.5 4.5 6 5 6.5 5.5C6 5.5 5.5 6 5.5 6.5C5.5 7 5.7 7.3 6 7.5C5.5 7.7 5 8.2 5 9C5 10 6 10.5 7 10.5H8V12M8 14V15" 
                stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
            <span>Think harder</span>
          </button>

          <button
            className={styles.sendButton}
            onClick={handleSend}
            disabled={!contactId || !input.trim() || loading}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M2 10L17 2L13 18L10 11L2 10Z" 
                fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}