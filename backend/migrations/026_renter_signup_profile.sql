-- 026_renter_signup_profile.sql
-- Renter-entered legal and billing profile collected during signup.

ALTER TABLE renters ADD COLUMN legal_entity_name TEXT;
ALTER TABLE renters ADD COLUMN commercial_registration_number TEXT;
ALTER TABLE renters ADD COLUMN billing_address TEXT;
ALTER TABLE renters ADD COLUMN vat_number TEXT;
ALTER TABLE renters ADD COLUMN expected_monthly_volume TEXT;
