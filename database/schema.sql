-- database/schema.sql
-- Run this file to create all tables

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Step 1: Create Users Table
-- This stores user accounts for authentication
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,  -- Never store plain passwords!
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true
);

-- Index for fast email lookups during login
CREATE INDEX idx_users_email ON users(email);

-- Step 2: Create Appointments Table
-- This stores all scheduled appointments
CREATE TABLE appointments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    service_type VARCHAR(100) NOT NULL,  -- e.g., "Consultation", "Follow-up"
    appointment_date DATE NOT NULL,
    appointment_time TIME NOT NULL,
    duration_minutes INTEGER DEFAULT 30,
    status VARCHAR(20) DEFAULT 'scheduled',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for common queries
CREATE INDEX idx_appointments_user_id ON appointments(user_id);
CREATE INDEX idx_appointments_date ON appointments(appointment_date);
CREATE INDEX idx_appointments_user_date ON appointments(user_id, appointment_date);

-- Step 3: Create Chat Sessions Table
-- Tracks conversation sessions for analytics
CREATE TABLE chat_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP WITH TIME ZONE,
    message_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true
);

CREATE INDEX idx_chat_sessions_user_id ON chat_sessions(user_id);

-- Step 4: Create Chat Messages Table
-- Stores individual messages in conversations
CREATE TABLE chat_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,  -- 'user' or 'assistant'
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_chat_messages_session_id ON chat_messages(session_id, created_at);

-- Step 5: Create Helper Function
-- This checks if a time slot is available
CREATE OR REPLACE FUNCTION check_appointment_availability(
    p_date DATE,
    p_time TIME,
    p_duration_minutes INTEGER DEFAULT 30
)
RETURNS BOOLEAN AS $$
DECLARE
    conflict_count INTEGER;
BEGIN
    -- Count how many appointments overlap with requested time
    SELECT COUNT(*) INTO conflict_count
    FROM appointments
    WHERE appointment_date = p_date
      AND status NOT IN ('cancelled', 'no_show')
      AND (
          -- Check if times overlap
          (appointment_time <= p_time AND 
           appointment_time + (duration_minutes || ' minutes')::INTERVAL > p_time)
          OR
          (appointment_time < p_time + (p_duration_minutes || ' minutes')::INTERVAL AND 
           appointment_time >= p_time)
      );
    
    -- Return true if no conflicts (slot is available)
    RETURN conflict_count = 0;
END;
$$ LANGUAGE plpgsql;

-- Step 6: Create Sample Test User
-- Password is 'password123' (hashed)
INSERT INTO users (email, password_hash, full_name, phone) VALUES
    ('test@example.com', '$2b$10$YourHashedPasswordHere', 'Test User', '+1-555-0100');

-- Verify tables were created
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';