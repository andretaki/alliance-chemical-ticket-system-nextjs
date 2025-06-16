-- Insert admin user with hashed password
INSERT INTO ticketing_prod.users (
    email,
    password,
    name,
    role,
    is_external,
    created_at,
    updated_at
) VALUES (
    'admin@example.com',
    '$2b$10$hNPRNcM8gX3ieruWYDraaObrX3M0QvLpk4lW6WGpJocKdp4MHCk3O', -- admin123
    'System Administrator',
    'admin',
    false,
    NOW(),
    NOW()
) ON CONFLICT (email) DO NOTHING; -- Skip if email already exists 