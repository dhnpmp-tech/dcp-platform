# Security Policy - DCP Platform

## Supported Version

| Version | Supported |
| --- | --- |
| `main` | Active |

## Reporting A Vulnerability

Do not open a public GitHub issue for security vulnerabilities.

Report security issues by emailing **security@dcp.sa**.

Include:

- Description of the vulnerability
- Steps to reproduce, with proof of concept if applicable
- Potential impact
- Your contact information for follow-up

We aim to acknowledge reports within 48 hours and provide a remediation timeline within 7 days.

## Responsible Disclosure

- Give the team reasonable time to fix an issue before public disclosure.
- Do not access, modify, or exfiltrate data that is not your own.
- Do not disrupt production availability.
- We do not currently offer a public bug bounty program.

## Security Controls

- Scoped API keys with revocation support
- TLS on public endpoints
- CORS allowlists
- Per-endpoint rate limits
- Server-side request validation
- Parameterized SQLite queries through `better-sqlite3`
- Payment webhook signature verification
- Container sandboxing for untrusted workloads
- Secret scanning in CI

## Known Limitations

- Some compatibility paths still accept API keys by query parameter; header auth is preferred.
- Admin authentication is token-based while the admin control plane continues to mature.
- Data residency and deployment regions should be reviewed before regulated production use.

## Contacts

- Security: security@dcp.sa
- Privacy and PDPL: privacy@dcp.sa
- Support: support@dcp.sa
