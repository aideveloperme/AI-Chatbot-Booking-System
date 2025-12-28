// frontend/src/components/Chat/ChatContainer.jsx
import React, { useRef, useEffect } from 'react';
import Message from './Message';
import './ChatContainer.css';

const ChatContainer = ({ messages, isLoading }) => {
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <div className="chat-container">
      {messages.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">💬</div>
          <h3>Start a conversation</h3>
          <p>Ask me to book an appointment and I'll help you schedule it!</p>
        </div>
      ) : (
        <div className="messages-list">
          {messages.map((msg, idx) => (
            <Message key={idx} message={msg} />
          ))}
          {isLoading && (
            <div className="message message-assistant">
              <div className="message-content typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      )}
    </div>
  );
};

export default ChatContainer;