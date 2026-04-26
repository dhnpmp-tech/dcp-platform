'use strict';

// Cross-role email uniqueness.
//
// SQLite has a UNIQUE constraint on email *within* the providers table and
// *within* the renters table, but no cross-table FK. Without this guard a
// single email can hold both a provider and a renter account, which produced
// duplicate rows during Fadi's onboarding (see migration 006).
//
// This module provides a single helper that the registration paths
// (v1-wizard.js, renters.js, providers.js) call before INSERT. Soft-deleted
// rows (deleted_at IS NOT NULL) are ignored so an email can be re-used after
// account closure.

function findActiveAccountByEmail(db, email) {
  if (!db || typeof email !== 'string') return null;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  const provider = db.get(
    `SELECT id, email, status FROM providers
     WHERE LOWER(email) = LOWER(?) AND deleted_at IS NULL
     LIMIT 1`,
    normalized
  );
  if (provider) {
    return { role: 'provider', id: provider.id, email: provider.email, status: provider.status };
  }

  const renter = db.get(
    `SELECT id, email, status FROM renters
     WHERE LOWER(email) = LOWER(?) AND deleted_at IS NULL
     LIMIT 1`,
    normalized
  );
  if (renter) {
    return { role: 'renter', id: renter.id, email: renter.email, status: renter.status };
  }

  return null;
}

function buildConflictResponse(role, attemptingRole) {
  return {
    code: 'cross_role_email_conflict',
    message: `This email is already registered as a ${role}. A single email can only hold one role on DCP. Please use a different email to register as a ${attemptingRole}, or sign in to your existing ${role} account.`,
    existing_role: role,
  };
}

module.exports = {
  findActiveAccountByEmail,
  buildConflictResponse,
};
