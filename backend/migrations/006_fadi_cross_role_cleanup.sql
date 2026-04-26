-- 006: Fadi cross-role cleanup + cross-role uniqueness data fix.
--
-- Context: During Fadi's onboarding (Yazan provider rig, 2026-04-26) two
-- renter rows were created for the same human:
--   id 1774351995142  mcmazyad@gmail.com  (kept)
--   id 1774351995146  mcmazyad@live.com   (this one — duplicate of his provider)
-- and one provider row:
--   id 1774351995309  mcmazyad@live.com   (kept)
--
-- Decision (Peter, 2026-04-26): keep mcmazyad@gmail.com as the renter identity
-- and mcmazyad@live.com as the provider identity. Soft-delete the duplicate
-- renter row. The email field is hash-renamed using the same scheme
-- backend/src/routes/renters.js:hashedDeletedEmail() uses for prod (sha256
-- truncated to 32 hex chars), so the unique-email slot is freed in case the
-- account ever needs to be recreated under a different role.
--
-- Hash precomputed on a developer machine and verified:
--   node -e "console.log(require('crypto').createHash('sha256')
--     .update('mcmazyad@live.com').digest('hex').slice(0, 32))"
--   → 6f84e5a290ae06b64db4bd7444a14aea
--
-- Forward-only. No rollback script.

UPDATE renters
SET
  email = 'deleted_6f84e5a290ae06b64db4bd7444a14aea@deleted.dcp.sa',
  status = 'deleted',
  deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = 1774351995146
  AND email = 'mcmazyad@live.com'
  AND deleted_at IS NULL;
