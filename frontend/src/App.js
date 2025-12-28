import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './App.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';
axios.defaults.baseURL = API_URL;

/* =======================
   AUTH FORM (OUTSIDE APP)
======================= */
function AuthForm({
  authMode,
  setAuthMode,
  authForm,
  setAuthForm,
  handleAuthSubmit,
  isLoading
}) {
  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1>AI Appointment Booking</h1>
        <p className="auth-subtitle">
          {authMode === 'login'
            ? 'Sign in to your account'
            : 'Create a new account'}
        </p>

        <form onSubmit={handleAuthSubmit}>
          {authMode === 'register' && (
            <>
              <input
                type="text"
                placeholder="Full Name"
                value={authForm.fullName}
                onChange={(e) =>
                  setAuthForm({ ...authForm, fullName: e.target.value })
                }
                required
              />
              <input
                type="tel"
                placeholder="Phone (optional)"
                value={authForm.phone}
                onChange={(e) =>
                  setAuthForm({ ...authForm, phone: e.target.value })
                }
              />
            </>
          )}

          <input
            type="email"
            placeholder="Email"
            value={authForm.email}
            onChange={(e) =>
              setAuthForm({ ...authForm, email: e.target.value })
            }
            required
          />

          <input
            type="password"
            placeholder="Password"
            value={authForm.password}
            onChange={(e) =>
              setAuthForm({ ...authForm, password: e.target.value })
            }
            required
            minLength="8"
          />

          <button type="submit" disabled={isLoading}>
            {isLoading
              ? 'Processing...'
              : authMode === 'login'
              ? 'Sign In'
              : 'Sign Up'}
          </button>
        </form>

        <p className="auth-toggle">
          {authMode === 'login'
            ? "Don't have an account? "
            : 'Already have an account? '}
          <button
            type="button"
            className="link-button"
            onClick={() =>
              setAuthMode(authMode === 'login' ? 'register' : 'login')
            }
          >
            {authMode === 'login' ? 'Sign Up' : 'Sign In'}
          </button>
        </p>
      </div>
    </div>
  );
}

/* =======================
   MAIN APP
======================= */
function App() {
  const [showAuth, setShowAuth] = useState(true);
  const [authMode, setAuthMode] = useState('login');
  const [isLoading, setIsLoading] = useState(false);

  const [authForm, setAuthForm] = useState({
    email: '',
    password: '',
    fullName: '',
    phone: ''
  });

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const endpoint =
        authMode === 'login'
          ? '/api/auth/login'
          : '/api/auth/register';

      const payload =
        authMode === 'login'
          ? { email: authForm.email, password: authForm.password }
          : authForm;

      await axios.post(endpoint, payload);

      setShowAuth(false);
    } catch (err) {
      alert('Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthForm
      authMode={authMode}
      setAuthMode={setAuthMode}
      authForm={authForm}
      setAuthForm={setAuthForm}
      handleAuthSubmit={handleAuthSubmit}
      isLoading={isLoading}
    />
  );
}

export default App;
