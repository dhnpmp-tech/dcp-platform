'use strict';

/**
 * Invoice & Settlement Record Generation — DCP-780
 *
 * GET /api/jobs/:jobId/invoice        — structured invoice JSON
 * GET /api/jobs/:jobId/invoice.pdf    — downloadable PDF invoice
 * GET /api/renters/:renterId/invoices — paginated list + CSV export
 *
 * Currency: halala internal (1 SAR = 100 halala), 1 USD = 3.75 SAR fixed peg.
 * Platform fee: 15% blended take rate (platform pricing model).
 * settlement_hash: SHA-256 of canonical fields — tamper-evidence seal.
 */

const express = require('express');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { getApiKeyFromReq, isAdminRequest } = require('../middleware/auth');

const SAR_PER_USD = 3.75;
const PLATFORM_FEE_PCT = 15;

function isAdmin(req) { return isAdminRequest(req); }

function getRenterFromReq(req) {
  const key = getApiKeyFromReq(req, { headerName: 'x-renter-key', queryNames: ['renter_key', 'key'] });
  if (!key) return null;
  return db.get('SELECT id FROM renters WHERE api_key = ? AND status = ?', key, 'active') || null;
}

function buildInvoiceData(jobId) {
  const job = db.get(
    `SELECT j.job_id, j.renter_id, j.provider_id, j.model, j.job_type,
            j.status, j.completed_at, j.duration_minutes, j.duration_seconds,
            COALESCE(j.actual_cost_halala, j.cost_halala, 0) AS cost_halala
     FROM jobs j WHERE j.job_id = ?`, jobId
  );
  if (!job || job.status !== 'completed') return null;

  const renter = db.get('SELECT id, name, email, organization FROM renters WHERE id = ?', job.renter_id);
  const provider = job.provider_id ? db.get('SELECT id, name, gpu_model FROM providers WHERE id = ?', job.provider_id) : null;
  const settlement = db.get('SELECT gross_amount_halala, platform_fee_halala, duration_seconds, settled_at FROM job_settlements WHERE job_id = ?', jobId);
  const session = db.get('SELECT total_tokens FROM serve_sessions WHERE job_id = ?', jobId);

  const grossHalala = settlement ? settlement.gross_amount_halala : job.cost_halala;
  const platformFeeHalala = settlement ? settlement.platform_fee_halala : Math.round(grossHalala * (PLATFORM_FEE_PCT / 100));
  const subtotalHalala = grossHalala - platformFeeHalala;

  const subtotalUsd    = +(subtotalHalala    / 100 / SAR_PER_USD).toFixed(6);
  const platformFeeUsd = +(platformFeeHalala / 100 / SAR_PER_USD).toFixed(6);
  const totalUsd       = +(grossHalala       / 100 / SAR_PER_USD).toFixed(6);
  const sarEquivalent  = +(grossHalala / 100).toFixed(4);

  const durationSeconds = settlement?.duration_seconds ?? job.duration_seconds ?? (job.duration_minutes != null ? job.duration_minutes * 60 : null);
  const totalTokens = session?.total_tokens ?? null;
  const ratePerToken = totalTokens && totalTokens > 0 ? +(totalUsd / totalTokens).toFixed(9) : null;
  const timestamp = settlement?.settled_at ?? job.completed_at ?? new Date().toISOString();

  const canonical = { job_id: job.job_id, renter_id: job.renter_id, provider_id: job.provider_id ?? null, gross_halala: grossHalala, platform_fee_halala: platformFeeHalala, timestamp };
  const settlementHash = crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');

  return {
    invoice_id: null,
    job_id: job.job_id,
    renter: { id: renter?.id ?? job.renter_id, name: renter?.name ?? null, email: renter?.email ?? null, organization: renter?.organization ?? null },
    provider: provider ? { id: provider.id, name: provider.name, gpu_model: provider.gpu_model ?? null } : null,
    model: job.model ?? null,
    job_type: job.job_type ?? null,
    tokens_input: null,
    tokens_output: totalTokens,
    duration_seconds: durationSeconds,
    rate_per_token: ratePerToken,
    subtotal_usd: subtotalUsd,
    platform_fee_usd: platformFeeUsd,
    total_usd: totalUsd,
    sar_equivalent: sarEquivalent,
    timestamp,
    settlement_hash: settlementHash,
  };
}

function upsertInvoiceRecord(data) {
  const existing = db.get('SELECT invoice_id FROM invoices WHERE job_id = ?', data.job_id);
  if (existing) return existing.invoice_id;
  const id = uuidv4();
  db.run('INSERT INTO invoices (invoice_id, job_id, renter_id, provider_id, amount_usd, sar_equivalent, settlement_hash) VALUES (?,?,?,?,?,?,?)',
    id, data.job_id, data.renter.id, data.provider?.id ?? null, data.total_usd, data.sar_equivalent, data.settlement_hash);
  return id;
}

let PDFDocument;
try { PDFDocument = require('pdfkit'); } catch (_) { PDFDocument = null; }

function generatePdf(invoice, res) {
  if (!PDFDocument) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="invoice-${invoice.job_id}.txt"`);
    return res.send(formatText(invoice));
  }
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="invoice-${invoice.job_id}.pdf"`);
  doc.pipe(res);
  doc.fontSize(20).font('Helvetica-Bold').text('DCP — Decentralized Compute Platform');
  doc.moveDown(0.3);
  doc.fontSize(10).font('Helvetica').fillColor('#666').text('Tax Invoice / Receipt');
  doc.moveDown(1);
  doc.fillColor('#000').fontSize(11).font('Helvetica-Bold').text('INVOICE DETAILS');
  doc.font('Helvetica').fontSize(10).moveDown(0.3);
  doc.text(`Invoice ID:   ${invoice.invoice_id}`);
  doc.text(`Job ID:       ${invoice.job_id}`);
  doc.text(`Date:         ${new Date(invoice.timestamp).toUTCString()}`);
  doc.moveDown(0.8);
  doc.fontSize(11).font('Helvetica-Bold').text('BILLED TO');
  doc.font('Helvetica').fontSize(10).moveDown(0.3);
  doc.text(`Name:         ${invoice.renter.name ?? '—'}`);
  doc.text(`Email:        ${invoice.renter.email ?? '—'}`);
  if (invoice.renter.organization) doc.text(`Organization: ${invoice.renter.organization}`);
  doc.moveDown(0.8);
  doc.fontSize(11).font('Helvetica-Bold').text('JOB DETAILS');
  doc.font('Helvetica').fontSize(10).moveDown(0.3);
  doc.text(`Model:        ${invoice.model ?? '—'}`);
  doc.text(`Provider GPU: ${invoice.provider?.gpu_model ?? '—'}`);
  if (invoice.duration_seconds != null) doc.text(`Duration:     ${invoice.duration_seconds}s`);
  if (invoice.tokens_output != null) doc.text(`Tokens:       ${invoice.tokens_output.toLocaleString()}`);
  doc.moveDown(0.8);
  doc.fontSize(11).font('Helvetica-Bold').text('CHARGES');
  doc.font('Helvetica').fontSize(10).moveDown(0.3);
  doc.text(`Compute subtotal:       $${invoice.subtotal_usd.toFixed(6)} USD`);
  doc.text(`Platform fee (${PLATFORM_FEE_PCT}%):      $${invoice.platform_fee_usd.toFixed(6)} USD`);
  doc.moveDown(0.2);
  doc.fontSize(12).font('Helvetica-Bold').text(`TOTAL:                  $${invoice.total_usd.toFixed(6)} USD`);
  doc.fontSize(10).font('Helvetica').fillColor('#555');
  doc.text(`SAR equivalent: ${invoice.sar_equivalent.toFixed(4)} SAR (1 USD = ${SAR_PER_USD} SAR fixed peg)`);
  doc.moveDown(1);
  doc.fillColor('#000').fontSize(9);
  doc.text('SETTLEMENT HASH (SHA-256):');
  doc.text(invoice.settlement_hash);
  doc.end();
}

function formatText(inv) {
  return [
    '='.repeat(52), '  DCP — Decentralized Compute Platform', '  Tax Invoice / Receipt', '='.repeat(52), '',
    `Invoice ID:    ${inv.invoice_id}`, `Job ID:        ${inv.job_id}`, `Date:          ${new Date(inv.timestamp).toUTCString()}`, '',
    'BILLED TO', `  Name:        ${inv.renter.name ?? '—'}`, `  Email:       ${inv.renter.email ?? '—'}`, '',
    'JOB DETAILS', `  Model:       ${inv.model ?? '—'}`, `  GPU:         ${inv.provider?.gpu_model ?? '—'}`,
    inv.duration_seconds != null ? `  Duration:    ${inv.duration_seconds}s` : null, '',
    'CHARGES', `  Subtotal:    $${inv.subtotal_usd.toFixed(6)} USD`, `  Fee (15%):   $${inv.platform_fee_usd.toFixed(6)} USD`,
    `  TOTAL:       $${inv.total_usd.toFixed(6)} USD`, `               ${inv.sar_equivalent.toFixed(4)} SAR`, '',
    'SETTLEMENT HASH (SHA-256):', `  ${inv.settlement_hash}`, '='.repeat(52),
  ].filter(l => l !== null).join('\n');
}

const jobsInvoiceRouter = express.Router();

jobsInvoiceRouter.get('/:jobId/invoice', (req, res) => {
  const { jobId } = req.params;
  const job = db.get('SELECT renter_id, status FROM jobs WHERE job_id = ?', jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (!isAdmin(req)) {
    const renter = getRenterFromReq(req);
    if (!renter || renter.id !== job.renter_id) return res.status(403).json({ error: 'Forbidden' });
  }
  if (job.status !== 'completed') return res.status(409).json({ error: 'Invoice not available', detail: `Job status is '${job.status}'` });
  const data = buildInvoiceData(jobId);
  if (!data) return res.status(404).json({ error: 'Invoice data not available' });
  data.invoice_id = upsertInvoiceRecord(data);
  return res.json(data);
});

jobsInvoiceRouter.get('/:jobId/invoice.pdf', (req, res) => {
  const { jobId } = req.params;
  const job = db.get('SELECT renter_id, status FROM jobs WHERE job_id = ?', jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (!isAdmin(req)) {
    const renter = getRenterFromReq(req);
    if (!renter || renter.id !== job.renter_id) return res.status(403).json({ error: 'Forbidden' });
  }
  if (job.status !== 'completed') return res.status(409).json({ error: 'Invoice not available', detail: `Job status is '${job.status}'` });
  const data = buildInvoiceData(jobId);
  if (!data) return res.status(404).json({ error: 'Invoice data not available' });
  data.invoice_id = upsertInvoiceRecord(data);
  generatePdf(data, res);
});

const rentersInvoiceRouter = express.Router();

rentersInvoiceRouter.get('/:renterId/invoices', (req, res) => {
  const renterIdInt = parseInt(req.params.renterId, 10);
  if (!Number.isFinite(renterIdInt)) return res.status(400).json({ error: 'Invalid renter ID' });
  if (!isAdmin(req)) {
    const renter = getRenterFromReq(req);
    if (!renter || renter.id !== renterIdInt) return res.status(403).json({ error: 'Forbidden' });
  }
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const offset = (page - 1) * limit;
  const total = db.get('SELECT COUNT(*) AS n FROM invoices WHERE renter_id = ?', renterIdInt);
  const rows = db.all(
    `SELECT i.invoice_id, i.job_id, i.amount_usd, i.sar_equivalent, i.settlement_hash, i.created_at,
            j.model, j.job_type, j.status AS job_status, j.completed_at, j.duration_seconds,
            p.name AS provider_name, p.gpu_model AS provider_gpu
     FROM invoices i
     LEFT JOIN jobs j ON j.job_id = i.job_id
     LEFT JOIN providers p ON p.id = i.provider_id
     WHERE i.renter_id = ? ORDER BY i.created_at DESC LIMIT ? OFFSET ?`,
    renterIdInt, limit, offset
  );
  if (req.query.format === 'csv') {
    const hdr = ['invoice_id','job_id','model','job_type','amount_usd','sar_equivalent','provider_gpu','completed_at','settlement_hash'];
    const lines = [hdr.join(',')];
    for (const r of rows) lines.push([e(r.invoice_id),e(r.job_id),e(r.model??''),e(r.job_type??''),r.amount_usd.toFixed(6),r.sar_equivalent.toFixed(4),e(r.provider_gpu??''),e(r.completed_at??''),e(r.settlement_hash)].join(','));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="invoices-renter-${renterIdInt}.csv"`);
    return res.send(lines.join('\r\n'));
  }
  return res.json({ invoices: rows, pagination: { page, limit, total: total?.n ?? 0, pages: Math.ceil((total?.n ?? 0) / limit) } });
});

function e(v) { const s = String(v??''); return (s.includes(',')||s.includes('"')||s.includes('\n')) ? '"'+s.replace(/"/g,'""')+'"' : s; }

module.exports = { jobsInvoiceRouter, rentersInvoiceRouter };
