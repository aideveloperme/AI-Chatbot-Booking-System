// frontend/src/services/api.js
// Centralized API client for all backend requests

import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

// Create axios instance with default config
const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - Add auth token to requests
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - Handle errors globally
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid
      localStorage.removeItem('authToken');
      localStorage.removeItem('user');
      window.location.href = '/';
    }
    return Promise.reject(error);
  }
);

// API methods
const api = {
  // Health check
  health: () => apiClient.get('/health'),

  // Authentication
  auth: {
    register: (data) => apiClient.post('/api/auth/register', data),
    login: (data) => apiClient.post('/api/auth/login', data),
  },

  // Chatbot
  chatbot: {
    getToken: () => apiClient.post('/api/chatbot/token'),
    sendMessage: (message, conversationHistory) =>
      apiClient.post('/api/chatbot/message', {
        message,
        conversationHistory,
      }),
  },

  // Appointments
  appointments: {
    list: (params) => apiClient.get('/api/appointments', { params }),
    create: (data) => apiClient.post('/api/appointments', data),
    update: (id, data) => apiClient.put(`/api/appointments/${id}`, data),
    delete: (id) => apiClient.delete(`/api/appointments/${id}`),
  },
};

export default api;