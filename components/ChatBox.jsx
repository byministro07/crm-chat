// components/ChatBox.jsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { marked } from 'marked';
import styles from './ChatBox.module.css';

export default function ChatBox({ 
  contactId, 
  sessionId, 
  modelTier, 
  thinkHarder, 
  setThinkHarder,
  selectedContact,
  onSessionCreated,
  onMessageSent
}) {
  // Configure marked for safety
  marked.setOptions({
    breaks: true,
    gfm: true,
  });

  // Safe markdown renderer
  const renderMessage = (content) => {
    const sanitized = (content || '')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/&lt;(\/?)(b|i|strong|em|u|br|p|h[1-6]|ul|ol|li|code|pre|blockquote)&gt;/gi, '<$1$2>');
    return marked.parse(sanitized);
  };
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState(sessionId);
  const creatingSessionRef = useRef(false);
  const [showModeToast, setShowModeToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [showRetryDropdown, setShowRetryDropdown] = useState(false);
  const [retryingMessage, setRetryingMessage] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

	// Load messages if we have a session
	useEffect(() => {
		if (sessionId) {
			setCurrentSessionId(sessionId);
			// Check if this is a newly created session
			const isNewSession = creatingSessionRef.current;
			if (!isNewSession) {
				loadMessages(sessionId, false);
			}
			creatingSessionRef.current = false;
		} else {
			setMessages([]);
			setCurrentSessionId(null);
		}
	}, [sessionId]);

  // Reset to Flash mode when changing conversations or contacts
  useEffect(() => {
    setThinkHarder(false);
  }, [sessionId, contactId]);

  // Auto-focus input
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [selectedContact]);

  // Auto-focus on messages change
  useEffect(() => {
    if (!loading && inputRef.current) {
      inputRef.current.focus();
    }
  }, [messages, loading, selectedContact]);

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Close retry dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        showRetryDropdown &&
        !e.target.closest(`.${styles.retryContainer}`) &&
        !e.target.closest(`.${styles.retryDropdown}`)
      ) {
        setShowRetryDropdown(false);
      }
    };

    if (showRetryDropdown) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showRetryDropdown]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

	const loadMessages = async (sessionId, isNewSession = false) => {
		try {
			const res = await fetch(`/api/chat/session/messages?sessionId=${sessionId}`);
			if (res.ok) {
				const data = await res.json();
				// If this is a new session and we have messages (temp message), keep them
				if (isNewSession && messages.length > 0) {
					// Don't overwrite - the temp message should stay
					return;
				}
				setMessages(data.messages || []);
			}
		} catch (err) {
			console.error('Failed to load messages:', err);
		}
	};

  const handleSend = async () => {
    if (!input.trim() || !contactId || loading) return;

    const userMessage = input.trim();
    
    // Add user message to UI immediately (BEFORE clearing input)
    const tempUserMessage = {
      role: 'user',
      content: userMessage,
      created_at: new Date().toISOString()
    };
    setMessages(prev => [...prev, tempUserMessage]);

    // Clear input AFTER adding message
    setInput('');
    setLoading(true);

    try {
      // Create session if needed (only on first message)
      let activeSessionId = currentSessionId;
      if (!activeSessionId) {
        creatingSessionRef.current = true;  // Mark that we're creating a session
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

          // Don't clear messages - we want to keep the user message visible
          creatingSessionRef.current = false;
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

      // Call parent handler for status update
      if (onMessageSent) {
        onMessageSent();
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

  const handleRetryMessage = async (useGeniusMode) => {
    if (!messages.length || retryingMessage) return;
    
    // Find last assistant message
    const lastAssistantIndex = messages.findLastIndex(m => m.role === 'assistant');
    if (lastAssistantIndex === -1) return;
    
    // Get the last user message before it
    const lastUserIndex = messages.slice(0, lastAssistantIndex).findLastIndex(m => m.role === 'user');
    if (lastUserIndex === -1) return;
    
    const userMessage = messages[lastUserIndex].content;
    
    setShowRetryDropdown(false);
    setRetryingMessage(true);
    
    // Remove the last assistant message from UI
    setMessages(prev => prev.slice(0, lastAssistantIndex));
    
    try {
      // Resend with specified mode
      const res = await fetch('/api/chat/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId,
          question: userMessage,
          tier: useGeniusMode ? 'high' : 'medium',
          sessionId: currentSessionId,
          isRetry: true
        })
      });

      if (!res.ok) throw new Error('Failed to retry message');

      const data = await res.json();
      
      // Add new assistant response
      const assistantMessage = {
        role: 'assistant',
        content: data.answer,
        created_at: new Date().toISOString(),
        model: data.model
      };
      setMessages(prev => [...prev, assistantMessage]);
      
    } catch (err) {
      console.error('Failed to retry message:', err);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        created_at: new Date().toISOString(),
        isError: true
      }]);
    } finally {
      setRetryingMessage(false);
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
            {messages.map((message, index) => {
              const isLastAssistant = message.role === 'assistant' && 
                index === messages.findLastIndex(m => m.role === 'assistant');
              
              return (
                <div
                  key={index}
                  className={`${styles.messageWrapper} ${
                    message.role === 'user' ? styles.userMessage : styles.assistantMessage
                  }`}
                >
                  <div className={styles.message}>
                  <div 
                    className={styles.messageContent}
                    dangerouslySetInnerHTML={{ 
                      __html: renderMessage(message.content) 
                    }}
                  />
                    {message.role === 'assistant' && message.model && (
                      <div className={styles.messageModel}>
                        {message.model}
                      </div>
                    )}
                    
                    {/* Retry button for last assistant message */}
                    {isLastAssistant && !loading && !retryingMessage && (
                      <div className={styles.retryContainer}>
                        <div className={styles.retryButtonGroup}>
                          <button
                            className={styles.retryButton}
                            onClick={() => handleRetryMessage(message.model?.includes('gpt-5'))}
                            aria-label="Retry with same model"
                            title={`Retry with ${message.model?.includes('gpt-5') ? 'Genius' : 'Flash'} mode`}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M1 4v6h6M23 20v-6h-6"/>
                              <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
                            </svg>
                          </button>
                          <button
                            className={styles.retryDropdownButton}
                            onClick={() => setShowRetryDropdown(!showRetryDropdown)}
                            aria-label="More retry options"
                          >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M6 9l6 6 6-6"/>
                            </svg>
                          </button>
                        </div>
                        
                        {showRetryDropdown && (
                          <div className={styles.retryDropdown}>
                            <button
                              className={styles.retryOption}
                              onClick={() => handleRetryMessage(!message.model?.includes('gpt-5'))}
                            >
                              {message.model?.includes('gpt-5') ? (
                                <>
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFEA00" strokeWidth="2">
                                    <path d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" />
                                  </svg>
                                  <span>Retry with Flash</span>
                                </>
                              ) : (
                                <>
                                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#007AFF" strokeWidth="1.5">
                                    <path d="M8 12V3.33"/>
                                    <path d="M10 8.67a2.78 2.78 0 0 1-2-2.67 2.78 2.78 0 0 1-2 2.67"/>
                                    <path d="M11.73 4.33A2 2 0 1 0 8 3.33a2 2 0 1 0-3.73 1"/>
                                    <path d="M11.998 3.42a2.67 2.67 0 0 1 1.684 3.85"/>
                                    <path d="M12 12a2.67 2.67 0 0 0 1.33-4.98"/>
                                    <path d="M13.31 11.66A2.67 2.67 0 1 1 8 12a2.67 2.67 0 1 1-5.31-.34"/>
                                    <path d="M4 12a2.67 2.67 0 0 1-1.33-4.98"/>
                                    <path d="M4.002 3.42a2.67 2.67 0 0 0-1.684 3.85"/>
                                  </svg>
                                  <span>Retry with Genius</span>
                                </>
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
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
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={contactId ? "Type your message..." : "Select a contact first"}
            disabled={!contactId || loading}
            className={styles.input}
            rows={1}
            style={{ 
              resize: 'none',
              overflow: 'hidden',
              minHeight: '20px',
              maxHeight: '120px'
            }}
            onInput={(e) => {
              e.target.style.height = 'auto';
              e.target.style.height = e.target.scrollHeight + 'px';
            }}
          />

          {/* Mode Toast Notification */}
          {showModeToast && (
            <div className={styles.modeToast}>
              {toastMessage}
            </div>
          )}

          {/* Mode Toggle Switch */}
          <button
            className={styles.modeToggle}
            onClick={() => {
              const newMode = !thinkHarder;
              setThinkHarder(newMode);
              
              // Show toast
              setToastMessage(newMode ? 'Genius Mode Activated' : 'Flash Mode Activated');
              setShowModeToast(true);
              
              // Hide toast after 2 seconds
              setTimeout(() => {
                setShowModeToast(false);
              }, 2000);
            }}
            disabled={!contactId}
            aria-label={thinkHarder ? "Switch to Flash mode" : "Switch to Genius mode"}
          >
            <div className={`${styles.toggleTrack} ${thinkHarder ? styles.toggleTrackActive : ''}`}>
              <div className={`${styles.toggleThumb} ${thinkHarder ? styles.toggleThumbActive : ''}`}>
                {!thinkHarder ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 12V3.33"/>
                    <path d="M10 8.67a2.78 2.78 0 0 1-2-2.67 2.78 2.78 0 0 1-2 2.67"/>
                    <path d="M11.73 4.33A2 2 0 1 0 8 3.33a2 2 0 1 0-3.73 1"/>
                    <path d="M11.998 3.42a2.67 2.67 0 0 1 1.684 3.85"/>
                    <path d="M12 12a2.67 2.67 0 0 0 1.33-4.98"/>
                    <path d="M13.31 11.66A2.67 2.67 0 1 1 8 12a2.67 2.67 0 1 1-5.31-.34"/>
                    <path d="M4 12a2.67 2.67 0 0 1-1.33-4.98"/>
                    <path d="M4.002 3.42a2.67 2.67 0 0 0-1.684 3.85"/>
                  </svg>
                )}
              </div>
            </div>
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