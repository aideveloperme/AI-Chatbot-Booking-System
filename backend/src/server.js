// Backend API Server - Node.js + Express
// File: backend/src/server.js

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8000;

// Database connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    console.log('Database connected successfully');
  }
});

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(morgan('combined'));

// Rate limiting store (simple in-memory for demo)
const rateLimitStore = new Map();

// Middleware: Rate limiting
const rateLimit = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  return (req, res, next) => {
    const identifier = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    
    if (!rateLimitStore.has(identifier)) {
      rateLimitStore.set(identifier, { count: 1, resetTime: now + windowMs });
      return next();
    }
    
    const userLimit = rateLimitStore.get(identifier);
    
    if (now > userLimit.resetTime) {
      rateLimitStore.set(identifier, { count: 1, resetTime: now + windowMs });
      return next();
    }
    
    if (userLimit.count >= maxRequests) {
      return res.status(429).json({ 
        error: 'Too many requests', 
        retryAfter: Math.ceil((userLimit.resetTime - now) / 1000) 
      });
    }
    
    userLimit.count++;
    next();
  };
};

// Middleware: Authentication
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Verify user still exists
    const result = await pool.query(
      'SELECT id, email, full_name, is_active FROM users WHERE id = $1',
      [decoded.userId]
    );
    
    if (result.rows.length === 0 || !result.rows[0].is_active) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    req.user = result.rows[0];
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    console.error('Authentication error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

// Middleware: Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// Routes: Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Routes: Authentication - Register
app.post('/api/auth/register', rateLimit(10, 15 * 60 * 1000), async (req, res) => {
  try {
    const { email, password, fullName, phone } = req.body;
    
    // Validation
    if (!email || !password || !fullName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    
    // Check if user exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    
    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);
    
    // Create user
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, full_name, phone) VALUES ($1, $2, $3, $4) RETURNING id, email, full_name, created_at',
      [email.toLowerCase(), passwordHash, fullName, phone || null]
    );
    
    const user = result.rows[0];
    
    // Generate JWT
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Routes: Authentication - Login
app.post('/api/auth/login', rateLimit(10, 15 * 60 * 1000), async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    
    // Find user
    const result = await pool.query(
      'SELECT id, email, password_hash, full_name, is_active FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const user = result.rows[0];
    
    if (!user.is_active) {
      return res.status(401).json({ error: 'Account is disabled' });
    }
    
    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Update last login
    await pool.query(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
      [user.id]
    );
    
    // Generate JWT
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Routes: Chatbot - Generate token for AI service
app.post('/api/chatbot/token', authenticate, rateLimit(50, 15 * 60 * 1000), (req, res) => {
  try {
    // Generate short-lived token for AI service access
    const aiToken = jwt.sign(
      { 
        userId: req.user.id, 
        email: req.user.email,
        purpose: 'ai_service' 
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    
    res.json({
      token: aiToken,
      expiresIn: 3600
    });
  } catch (error) {
    console.error('Token generation error:', error);
    res.status(500).json({ error: 'Token generation failed' });
  }
});

// Routes: Chatbot - Send message (proxy to AI service)
app.post('/api/chatbot/message', authenticate, rateLimit(30, 15 * 60 * 1000), async (req, res) => {
  try {
    const { message, conversationHistory } = req.body;
    
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Invalid message' });
    }
    
    // Forward request to AI service
    const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:5000';
    
    const response = await axios.post(
      `${aiServiceUrl}/chat`,
      {
        message,
        conversationHistory: conversationHistory || [],
        userId: req.user.id
      },
      {
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
    
    res.json(response.data);
  } catch (error) {
    console.error('Chat error:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({ error: 'AI service unavailable' });
    }
    
    if (error.response) {
      return res.status(error.response.status).json({ 
        error: error.response.data.error || 'AI service error' 
      });
    }
    
    res.status(500).json({ error: 'Failed to process message' });
  }
});

// Routes: Appointments - List user's appointments
app.get('/api/appointments', authenticate, async (req, res) => {
  try {
    const { status, fromDate, toDate } = req.query;
    
    let query = 'SELECT * FROM appointments WHERE user_id = $1';
    const params = [req.user.id];
    let paramIndex = 2;
    
    if (status) {
      query += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }
    
    if (fromDate) {
      query += ` AND appointment_date >= $${paramIndex}`;
      params.push(fromDate);
      paramIndex++;
    }
    
    if (toDate) {
      query += ` AND appointment_date <= $${paramIndex}`;
      params.push(toDate);
      paramIndex++;
    }
    
    query += ' ORDER BY appointment_date, appointment_time';
    
    const result = await pool.query(query, params);
    
    res.json({
      appointments: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('Appointments fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch appointments' });
  }
});

// Routes: Appointments - Create (called by AI service)
app.post('/api/appointments', authenticate, async (req, res) => {
  try {
    const { serviceType, appointmentDate, appointmentTime, notes } = req.body;
    
    if (!serviceType || !appointmentDate || !appointmentTime) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Check availability
    const availabilityCheck = await pool.query(
      'SELECT check_appointment_availability($1, $2, $3) as available',
      [appointmentDate, appointmentTime, 30]
    );
    
    if (!availabilityCheck.rows[0].available) {
      return res.status(409).json({ error: 'Time slot not available' });
    }
    
    // Create appointment
    const result = await pool.query(
      `INSERT INTO appointments (user_id, service_type, appointment_date, appointment_time, notes, status) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING *`,
      [req.user.id, serviceType, appointmentDate, appointmentTime, notes || null, 'scheduled']
    );
    
    res.status(201).json({
      message: 'Appointment created successfully',
      appointment: result.rows[0]
    });
  } catch (error) {
    console.error('Appointment creation error:', error);
    res.status(500).json({ error: 'Failed to create appointment' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing server gracefully');
  await pool.end();
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  console.log(`Backend API running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});