-- 005: Provider compliance fields for PDPL consent capture.
--
-- Adds identity + consent columns captured via Step 5 of the /setup wizard
-- (see docs/superpowers/specs/2026-04-22-provider-flow-migration-design.md).
--
-- All columns nullable so the 33 legacy providers remain readable.
-- Forward-only migration; no rollback script.

ALTER TABLE providers ADD COLUMN full_name TEXT;
ALTER TABLE providers ADD COLUMN phone TEXT;
ALTER TABLE providers ADD COLUMN city TEXT;
ALTER TABLE providers ADD COLUMN country TEXT;
ALTER TABLE providers ADD COLUMN pdpl_consented_at TIMESTAMP;
