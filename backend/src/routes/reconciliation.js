/**
 * DC1 Billing Reconciliation Routes
 * Penny-perfect verification + audit reports
 */

const express = require('express');
const router = express.Router();
const engine = require('../services/reconciliation-engine');
const { safeErrorPayload } = require('../lib/error-response');

// GET /api/reconciliation/summary
router.get('/summary', (req, res) => {
  try {
    const result = engine.runFullReconciliation();
    res.json({
      totalCollectedHalala: result.totalCollectedHalala,
      totalPaidHalala: result.totalPaidHalala,
      dc1MarginHalala: result.dc1MarginHalala,
      discrepanciesCount: result.jobsFlagged,
      jobsChecked: result.jobsChecked,
      runAt: result.runAt
    });
  } catch (error) {
    console.error('[reconciliation] summary error:', error);
    res.status(500).json(safeErrorPayload(error, 'Reconciliation failed'));
  }
});

// GET /api/reconciliation/jobs
router.get('/jobs', (req, res) => {
  try {
    const db = require('../db');
    const jobs = db.all("SELECT * FROM jobs WHERE status = 'completed'") || [];
    const breakdown = jobs.map(job => {
      const result = engine.verifyJobBilling(job.job_id || job.id);
      return {
        jobId: result.jobId,
        renterPaidHalala: result.renterPaid,
        providerEarnedHalala: result.providerEarned,
        dc1FeeHalala: result.dc1Fee,
        clean: result.clean
      };
    });
    res.json({ jobs: breakdown, count: breakdown.length });
  } catch (error) {
    console.error('[reconciliation] jobs error:', error);
    res.status(500).json(safeErrorPayload(error, 'Failed to fetch jobs'));
  }
});

// GET /api/reconciliation/discrepancies
router.get('/discrepancies', (req, res) => {
  try {
    const result = engine.runFullReconciliation();
    res.json({
      discrepancies: result.flaggedJobs,
      count: result.jobsFlagged
    });
  } catch (error) {
    console.error('[reconciliation] discrepancies error:', error);
    res.status(500).json(safeErrorPayload(error, 'Failed to fetch discrepancies'));
  }
});

// POST /api/reconciliation/verify/:job_id
router.post('/verify/:job_id', (req, res) => {
  try {
    const { job_id } = req.params;
    const billing = engine.verifyJobBilling(job_id);
    const proof = engine.verifyProofHash(job_id);
    res.json({ billing, proof });
  } catch (error) {
    console.error('[reconciliation] verify error:', error);
    res.status(500).json(safeErrorPayload(error, 'Verification failed'));
  }
});

// GET /api/reconciliation/report
router.get('/report', (req, res) => {
  try {
    const report = engine.generateReport();
    res.json(report);
  } catch (error) {
    console.error('[reconciliation] report error:', error);
    res.status(500).json(safeErrorPayload(error, 'Report generation failed'));
  }
});

module.exports = router;
