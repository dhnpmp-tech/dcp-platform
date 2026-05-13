const providersRouter = require('../routes/providers');

describe('providers WG diag warnings', () => {
  const { _wgDiagWarnings } = providersRouter.__private;

  it('flags the 0.0.0.0/0 trap from config (Tareq Node 2 regression)', () => {
    const warnings = _wgDiagWarnings({
      allowed_ips_config: ['10.8.0.0/24', '0.0.0.0/0'],
      allowed_ips_runtime: ['10.8.0.0/24'],
      default_route_via_wg: false,
    });
    expect(warnings).toContain('routes_all_traffic_through_mesh');
  });

  it('flags when the system default route currently egresses via WG', () => {
    const warnings = _wgDiagWarnings({
      allowed_ips_config: ['10.8.0.0/24'],
      allowed_ips_runtime: ['10.8.0.0/24'],
      default_route_via_wg: true,
    });
    expect(warnings).toContain('routes_all_traffic_through_mesh');
  });

  it('flags runtime AllowedIPs = 0.0.0.0/0 even when config is patched', () => {
    const warnings = _wgDiagWarnings({
      allowed_ips_config: ['10.8.0.0/24'],
      allowed_ips_runtime: ['0.0.0.0/0'],
      default_route_via_wg: false,
    });
    expect(warnings).toContain('routes_all_traffic_through_mesh');
  });

  it('flags stale handshake (>300s) without false-positive routes warning', () => {
    const warnings = _wgDiagWarnings({
      allowed_ips_config: ['10.8.0.0/24'],
      allowed_ips_runtime: ['10.8.0.0/24'],
      default_route_via_wg: false,
      last_handshake_age_s: 600,
    });
    expect(warnings).toEqual(['handshake_stale']);
  });

  it('returns empty warnings for a healthy mesh-only tunnel', () => {
    const warnings = _wgDiagWarnings({
      allowed_ips_config: ['10.8.0.0/24'],
      allowed_ips_runtime: ['10.8.0.0/24'],
      default_route_via_wg: false,
      last_handshake_age_s: 30,
    });
    expect(warnings).toEqual([]);
  });

  it('is robust to missing fields (daemon partial response)', () => {
    expect(_wgDiagWarnings({})).toEqual([]);
    expect(_wgDiagWarnings(null)).toEqual([]);
  });

  // v0.2: DNS override regression (Tareq Node 2 — DNS=1.1.1.1 in wg0.conf,
  // MENA ISP filters 1.1.1.1, every hostname lookup fails when wg is up).
  it('does not warn when DNS is configured and reachable from provider', () => {
    const warnings = _wgDiagWarnings({
      allowed_ips_config: ['10.8.0.0/24'],
      allowed_ips_runtime: ['10.8.0.0/24'],
      default_route_via_wg: false,
      last_handshake_age_s: 30,
      dns_override: {
        configured: '1.1.1.1',
        resolver_reachable_from_provider: true,
        system_resolver_overridden: false,
      },
    });
    expect(warnings).toEqual([]);
  });

  it('fires dns_override_unreachable_from_provider when DNS is configured but unreachable (Tareq Node 2 regression)', () => {
    const warnings = _wgDiagWarnings({
      allowed_ips_config: ['10.8.0.0/24'],
      allowed_ips_runtime: ['10.8.0.0/24'],
      default_route_via_wg: false,
      last_handshake_age_s: 30,
      dns_override: {
        configured: '1.1.1.1',
        resolver_reachable_from_provider: false,
        system_resolver_overridden: true,
      },
    });
    expect(warnings).toContain('dns_override_unreachable_from_provider');
    // system_resolver_overridden=true should ALSO surface the info warning
    // — operators want to know the resolver was hijacked even if reachable.
    expect(warnings).toContain('dns_override_active');
  });

  it('does not emit DNS warnings when DNS line is absent from wg0.conf', () => {
    const warnings = _wgDiagWarnings({
      allowed_ips_config: ['10.8.0.0/24'],
      allowed_ips_runtime: ['10.8.0.0/24'],
      default_route_via_wg: false,
      last_handshake_age_s: 30,
      dns_override: {
        configured: null,
        resolver_reachable_from_provider: null,
        system_resolver_overridden: false,
      },
    });
    expect(warnings).not.toContain('dns_override_unreachable_from_provider');
    expect(warnings).not.toContain('dns_override_active');
    expect(warnings).toEqual([]);
  });
});
