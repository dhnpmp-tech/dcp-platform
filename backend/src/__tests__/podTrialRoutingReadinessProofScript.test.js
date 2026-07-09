'use strict';

const fs = require('fs');
const path = require('path');
const {
  buildPodTrialRoutingReadiness,
  POD_TRIAL_ROUTING_READINESS_VERSION,
} = require('../services/podTrialRoutingReadiness');

const scriptPath = path.resolve(__dirname, '../../tests/pod-trial-routing-readiness-proof.js');

describe('pod trial routing readiness proof script', () => {
  test('proof script references the public readiness route and policy guards', () => {
    const source = fs.readFileSync(scriptPath, 'utf8');

    expect(source).toContain('/api/pods/trial-routing/readiness');
    expect(source).toContain('on_demand_requires_prepaid_credit');
    expect(source).toContain('trial_credit_allowed_supply_tiers');
    expect(source).toContain('changes_trial_accounting');
  });

  test('builder exposes the expected contract version', () => {
    expect(buildPodTrialRoutingReadiness().version).toBe(POD_TRIAL_ROUTING_READINESS_VERSION);
  });
});
