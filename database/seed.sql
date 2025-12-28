-- database/seed.sql
-- Sample data for testing the appointment booking system

-- Insert test users
-- Password for all users is: "password123"
-- Hash generated with: bcrypt.hash("password123", 10)

INSERT INTO users (email, password_hash, full_name, phone) VALUES
    ('john.doe@example.com', '$2b$10$YQzE5Wl9xKX.jKX0K0K0K0K0K0K0K0K0K0K0K0K0K0K0K0K0K0K0K', 'John Doe', '+1-555-0101'),
    ('jane.smith@example.com', '$2b$10$YQzE5Wl9xKX.jKX0K0K0K0K0K0K0K0K0K0K0K0K0K0K0K0K0K0K0K', 'Jane Smith', '+1-555-0102'),
    ('bob.wilson@example.com', '$2b$10$YQzE5Wl9xKX.jKX0K0K0K0K0K0K0K0K0K0K0K0K0K0K0K0K0K0K0K', 'Bob Wilson', '+1-555-0103')
ON CONFLICT (email) DO NOTHING;

-- Insert sample appointments for the next week
INSERT INTO appointments (user_id, service_type, appointment_date, appointment_time, notes, status)
SELECT 
    u.id,
    'General Consultation',
    CURRENT_DATE + 1,
    '10:00:00',
    'Initial consultation - Patient referred by Dr. Smith',
    'scheduled'
FROM users u WHERE u.email = 'john.doe@example.com'
ON CONFLICT DO NOTHING;

INSERT INTO appointments (user_id, service_type, appointment_date, appointment_time, notes, status)
SELECT 
    u.id,
    'Follow-up',
    CURRENT_DATE + 2,
    '14:30:00',
    'Follow-up from previous consultation',
    'scheduled'
FROM users u WHERE u.email = 'john.doe@example.com'
ON CONFLICT DO NOTHING;

INSERT INTO appointments (user_id, service_type, appointment_date, appointment_time, notes, status)
SELECT 
    u.id,
    'Check-up',
    CURRENT_DATE + 3,
    '09:00:00',
    'Annual check-up',
    'confirmed'
FROM users u WHERE u.email = 'jane.smith@example.com'
ON CONFLICT DO NOTHING;

INSERT INTO appointments (user_id, service_type, appointment_date, appointment_time, notes, status)
SELECT 
    u.id,
    'Consultation',
    CURRENT_DATE + 5,
    '15:00:00',
    'New patient consultation',
    'scheduled'
FROM users u WHERE u.email = 'bob.wilson@example.com'
ON CONFLICT DO NOTHING;

-- Insert sample chat sessions
INSERT INTO chat_sessions (user_id, message_count, is_active)
SELECT 
    u.id,
    5,
    false
FROM users u WHERE u.email = 'john.doe@example.com'
ON CONFLICT DO NOTHING;

-- Insert sample chat messages
INSERT INTO chat_messages (session_id, role, content)
SELECT 
    cs.id,
    'user',
    'Hi, I need to book an appointment'
FROM chat_sessions cs
LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO chat_messages (session_id, role, content)
SELECT 
    cs.id,
    'assistant',
    'Hello! I''d be happy to help you book an appointment. What type of service do you need?'
FROM chat_sessions cs
LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO chat_messages (session_id, role, content)
SELECT 
    cs.id,
    'user',
    'I need a consultation'
FROM chat_sessions cs
LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO chat_messages (session_id, role, content)
SELECT 
    cs.id,
    'assistant',
    'Great! When would you like to schedule your consultation?'
FROM chat_sessions cs
LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO chat_messages (session_id, role, content)
SELECT 
    cs.id,
    'user',
    'Tomorrow at 10am'
FROM chat_sessions cs
LIMIT 1
ON CONFLICT DO NOTHING;

-- Display inserted data
SELECT 'Seed data inserted successfully!' as message;

SELECT 'Users:' as type, COUNT(*) as count FROM users
UNION ALL
SELECT 'Appointments:' as type, COUNT(*) as count FROM appointments
UNION ALL
SELECT 'Chat Sessions:' as type, COUNT(*) as count FROM chat_sessions
UNION ALL
SELECT 'Chat Messages:' as type, COUNT(*) as count FROM chat_messages;

-- Show upcoming appointments
SELECT 
    u.full_name,
    a.service_type,
    a.appointment_date,
    a.appointment_time,
    a.status
FROM appointments a
JOIN users u ON a.user_id = u.id
WHERE a.appointment_date >= CURRENT_DATE
ORDER BY a.appointment_date, a.appointment_time;