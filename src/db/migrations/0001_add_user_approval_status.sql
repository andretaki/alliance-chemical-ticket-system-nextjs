-- Create the user_approval_status enum type
DO $$ BEGIN
    CREATE TYPE ticketing_prod.user_approval_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add approval_status column to users table if it doesn't exist
DO $$ BEGIN
    ALTER TABLE ticketing_prod.users ADD COLUMN approval_status ticketing_prod.user_approval_status DEFAULT 'pending';
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

-- Update existing users to have 'approved' status
UPDATE ticketing_prod.users SET approval_status = 'approved' WHERE approval_status IS NULL; 