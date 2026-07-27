'use strict';

const { z } = require('zod');

/**
 * POST /api/renters/topup — sandbox top-up (dev/staging only).
 *
 * Accepts either halala (integer) or SAR (float); handler converts as needed.
 */
const renterTopupSchema = z
  .object({
    amount_halala: z.number().int().min(1).max(100000).optional(),
    amount_sar: z.number().min(0.01).max(1000).optional(),
  })
  .strict()
  .refine(
    (data) => data.amount_halala != null || data.amount_sar != null,
    { message: 'Provide amount_halala (int) or amount_sar (float)' }
  );

/**
 * POST /api/renters/register — renter registration body.
 */
const renterRegisterSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  organization: z.string().max(160).optional(),
  use_case: z.string().max(120).optional(),
  useCase: z.string().max(120).optional(),   // legacy alias accepted by the handler
  phone: z.string().max(40).optional(),
  legal_entity_name: z.string().max(180).optional(),
  legalEntityName: z.string().max(180).optional(),
  commercial_registration_number: z.string().max(40).optional(),
  commercialRegistrationNumber: z.string().max(40).optional(),
  cr_number: z.string().max(40).optional(),
  crNumber: z.string().max(40).optional(),
  billing_address: z.string().max(500).optional(),
  billingAddress: z.string().max(500).optional(),
  vat_number: z.string().max(40).optional(),
  vatNumber: z.string().max(40).optional(),
  expected_monthly_volume: z.string().max(120).optional(),
  expectedMonthlyVolume: z.string().max(120).optional(),
  expected_volume: z.string().max(120).optional(),
  expectedVolume: z.string().max(120).optional(),
}).strict();

/**
 * POST /api/renters/agent-register — programmatic zero-human renter signup.
 *
 * Everything is optional: an autonomous agent can register with an empty body
 * and still get a usable key + trial. Email is OPTIONAL (captured for audit /
 * recovery when supplied, never required) so we don't gate machine signups on
 * a mailbox. `label` is a free-text hint the agent can set to tag its account.
 */
const renterAgentRegisterSchema = z.object({
  email: z.string().email().max(254).optional(),
  label: z.string().max(120).optional(),
  organization: z.string().max(160).optional(),
  use_case: z.string().max(120).optional(),
}).strict();

module.exports = { renterTopupSchema, renterRegisterSchema, renterAgentRegisterSchema };
