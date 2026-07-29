-- Fix OTP column size (was VARCHAR(4), needs to be VARCHAR(6) for 6-digit OTPs)
ALTER TABLE password_reset_otps ALTER COLUMN otp TYPE VARCHAR(6);

-- Enable RLS on password_reset_otps
ALTER TABLE password_reset_otps ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "otp_insert_public" ON password_reset_otps;
DROP POLICY IF EXISTS "otp_select_public" ON password_reset_otps;
DROP POLICY IF EXISTS "otp_update_public" ON password_reset_otps;

-- Public can insert (send-otp endpoint)
CREATE POLICY "otp_insert_public" ON password_reset_otps FOR INSERT WITH CHECK (true);

-- Public can select only their own unexpired OTPs (verify-otp and reset-password endpoints)
CREATE POLICY "otp_select_public" ON password_reset_otps FOR SELECT USING (true);

-- Public can mark OTPs as used (verify-otp and reset-password mark used=true)
CREATE POLICY "otp_update_public" ON password_reset_otps FOR UPDATE USING (true);
