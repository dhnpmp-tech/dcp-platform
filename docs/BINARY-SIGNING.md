# DCP Binary Signing Plan

**Status:** Plan / Pre-certificate-purchase
**Owner:** Peter (founder-only for certificate custody)
**Scope:** Windows installer (.exe from NSIS), macOS installer (.pkg from build-mac-pkg.sh), Linux packages (.deb + raw daemon binaries)

---

## 1. Why this matters

The DCP provider daemon runs with elevated privileges on end-user machines (it manages GPU scheduling, binds local ports, is registered as a Windows service / systemd unit / launchd agent). Three concrete problems if binaries stay unsigned:

1. **SmartScreen / Gatekeeper block installs.** Unsigned NSIS installers trigger "Windows protected your PC" — most users abandon. Unsigned macOS .pkg files are refused by Gatekeeper ("cannot be opened because the developer cannot be verified").
2. **Supply-chain risk.** Without signatures, a user has no way to distinguish a real DCP binary from one swapped in by a CDN compromise, phishing site, or tampered mirror.
3. **Enterprise procurement.** Universities, internet cafes, and server-farm operators often require signed binaries before IT will greenlight install on managed fleets.

Cost of inaction grows with each release: every unsigned version needs a manual "right-click → Open → trust" walkthrough in onboarding docs, and every SmartScreen warning is a provider we lose.

---

## 2. Current state (what exists in the repo)

- `backend/installers/dcp-provider-Windows.nsi` — NSIS installer source. Produces an unsigned .exe.
- `backend/installers/build-mac-pkg.sh` — builds a .pkg via `pkgbuild`/`productbuild`. No `--sign` flag, no notarization step.
- `backend/installers/build-deb.sh` — builds a .deb. No `dpkg-sig` or apt repo GPG key.
- `backend/installers/daemon.sh`, `daemon.ps1`, `dcp_daemon.py` — raw daemon executables. No codesigning.
- `backend/public/install.sh` — curl-able bootstrap (the one-liner Peter already runs). No checksum verification beyond HTTPS in transit.
- No CI signing pipeline. No secrets configured in GitHub Actions for signing keys.

What's **not** in the repo and must not be committed:
- Private signing keys
- Certificate password / PFX / p12 files
- Apple app-specific passwords
- EV token PINs

---

## 3. Target state

Every published DCP artifact carries a verifiable signature matched to a certificate whose root chain is trusted on the target OS out of the box.

| Artifact | Signed with | Verified by |
|---|---|---|
| `dcp-setup-windows.exe` (NSIS output) | Windows Authenticode cert (OV or EV) | `signtool verify /pa /v` — MS Authenticode chain |
| `dcp_daemon.exe` (PyInstaller or embedded) | same Authenticode cert | ditto |
| `dcp-provider-macos.pkg` | Apple Developer ID Installer cert + notarized | Gatekeeper (online staple check) |
| `dcp_daemon` Mach-O binary inside .pkg | Apple Developer ID Application cert + hardened runtime | `codesign --verify --strict` |
| `dcp-provider-linux.deb` | `dpkg-sig` with project GPG key | `dpkg-sig --verify` |
| `install.sh` bootstrap | Detached GPG signature + sha256 pinned in doc | Manual: `gpg --verify install.sh.asc install.sh` |

---

## 4. Certificate acquisition

### 4.1 Windows — Authenticode

**Recommendation: EV (Extended Validation) code-signing certificate.**

Why EV over OV:
- EV bypasses SmartScreen reputation-build (OV accrues reputation over weeks/months, costing installs in the meantime).
- EV is required for Windows kernel-mode signing — not relevant today, but the daemon does touch GPU drivers through vendor SDKs and may need kernel signing later.

**Vendors and rough pricing (2026):**
- **DigiCert EV** — ~$474/yr (3-year ~$1,100). Hardware token shipped.
- **SSL.com EV** — ~$349/yr. Hardware token or cloud HSM option.
- **Sectigo EV** — ~$299/yr. Hardware token.

**Key-custody decision:** CA/B Forum rules (since June 2023) require *all* code-signing keys (OV and EV) to live in FIPS 140-2 Level 2 HSM or a pre-certified hardware token. Implication:
- We cannot generate a .pfx on a dev box and stash it in a password manager.
- Either a physical YubiKey / SafeNet token held by Peter, or a cloud HSM (DigiCert KeyLocker, SSL.com eSigner, Azure Key Vault Premium) that CI can authenticate to.

**Recommended path:** SSL.com EV with eSigner cloud-HSM. Rationale: CI (GitHub Actions) can sign without shipping a physical token to a runner; Peter retains account-level control via TOTP on the signing account; token/PIN rotation is a portal action not a physical swap.

**Fallback if budget-constrained:** SSL.com OV (~$129/yr) + accept 2-4 week SmartScreen reputation ramp. Not recommended.

### 4.2 macOS — Developer ID

Requires:
- **Apple Developer Program enrollment** — $99/yr, individual or organization. Organization requires D-U-N-S number.
- **Developer ID Installer certificate** (for the .pkg)
- **Developer ID Application certificate** (for the Mach-O daemon binary inside)
- **App-specific password** for `notarytool` to submit notarization jobs.

Keys live in Peter's login keychain on a designated signing Mac, OR in a dedicated signing Mac mini, OR exported as .p12 into GitHub Actions secrets + imported into a temporary keychain per run. The .p12 approach is industry-standard for CI but requires the export step every time the cert rotates.

### 4.3 Linux — GPG

No CA, no vendor fees. We generate our own 4096-bit RSA GPG key:

```bash
gpg --full-generate-key
# RSA and RSA (default), 4096 bits, key expires in 2 years
# Name: DCP Release Engineering
# Email: releases@dcp.sa
# Comment: DCP Provider Daemon Signing Key
```

Fingerprint is published in three places: `docs/SECURITY.md`, the DCP landing page footer, and the `install.sh` preamble comment. Key lives on a physical YubiKey (subkey for signing, master key offline on encrypted USB in a safe deposit box).

### 4.4 Procurement checklist (founder-only)

- [ ] Decide EV vs OV (recommend EV via SSL.com eSigner)
- [ ] Open SSL.com account with business email (releases@dcp.sa)
- [ ] Complete D-U-N-S lookup for DCP entity (if organization cert)
- [ ] Pay for Windows EV (~$349-474/yr depending on vendor)
- [ ] Enroll in Apple Developer Program — $99/yr
- [ ] Generate GPG master + signing subkey on air-gapped machine; provision YubiKey
- [ ] Record all account credentials in 1Password (not repo)

---

## 5. CI integration

### 5.1 Windows (SSL.com eSigner via GitHub Actions)

```yaml
# .github/workflows/release-windows.yml (proposed)
- name: Sign Windows artifacts
  uses: sslcom/esigner-codesign@v1
  with:
    command: sign
    username: ${{ secrets.ESIGNER_USERNAME }}
    password: ${{ secrets.ESIGNER_PASSWORD }}
    credential_id: ${{ secrets.ESIGNER_CREDENTIAL_ID }}
    totp_secret: ${{ secrets.ESIGNER_TOTP_SECRET }}
    file_path: dist/dcp-setup-windows.exe
    override: true
```

All four secrets set at the repo level, never printed, never echoed. TOTP secret is the shared HOTP seed from eSigner — not a rolling OTP. Rotation: regenerate TOTP seed in SSL.com portal every 90 days; update secret.

### 5.2 macOS (Developer ID + notarization)

```bash
# .github/workflows/release-macos.yml (proposed)
- run: |
    # Import cert into a clean per-run keychain
    security create-keychain -p actions build.keychain
    security import cert.p12 -k build.keychain -P "$CERT_PASSWORD" -T /usr/bin/codesign
    security set-key-partition-list -S apple-tool:,apple: -s -k actions build.keychain
    # Sign the daemon binary with hardened runtime
    codesign --sign "$DEVELOPER_ID_APPLICATION" --options runtime \
      --entitlements daemon.entitlements dist/dcp_daemon
    # Build and sign the installer
    productbuild --sign "$DEVELOPER_ID_INSTALLER" \
      --component dist/dcp-provider.app /Applications dist/dcp-provider-macos.pkg
    # Notarize (blocking — waits for Apple)
    xcrun notarytool submit dist/dcp-provider-macos.pkg \
      --apple-id "$APPLE_ID" --team-id "$TEAM_ID" \
      --password "$APP_SPECIFIC_PASSWORD" --wait
    # Staple the notarization ticket
    xcrun stapler staple dist/dcp-provider-macos.pkg
```

Required secrets: `CERT_P12_BASE64`, `CERT_PASSWORD`, `DEVELOPER_ID_APPLICATION`, `DEVELOPER_ID_INSTALLER`, `APPLE_ID`, `TEAM_ID`, `APP_SPECIFIC_PASSWORD`.

Entitlements file (`daemon.entitlements`) declares the exact capabilities the daemon needs — minimum viable set for hardened runtime compliance:
- `com.apple.security.device.audio-input` — **no** (daemon doesn't need it)
- `com.apple.security.network.client` — yes (talks to api.dcp.sa)
- `com.apple.security.network.server` — yes (binds local WS port)

### 5.3 Linux (dpkg-sig + detached GPG)

```bash
# Runs on a GitHub runner with the signing subkey imported
- run: |
    echo "$GPG_SIGNING_SUBKEY_ASCII" | gpg --import
    dpkg-sig --sign builder dist/dcp-provider-linux.deb
    gpg --armor --detach-sign dist/dcp-provider-linux.deb
    gpg --armor --detach-sign backend/public/install.sh
```

The master GPG key **never** touches CI. Only the signing subkey (exported via `gpg --export-secret-subkeys`) is in GitHub secrets.

---

## 6. Verification path (what users run)

### Windows
```powershell
signtool verify /pa /v dcp-setup-windows.exe
# expected: "Successfully verified: dcp-setup-windows.exe"
```

### macOS
```bash
spctl --assess --type install -vvv dcp-provider-macos.pkg
# expected: "source=Notarized Developer ID"
```

### Linux
```bash
gpg --recv-keys E3B1C2A4F5D67890   # DCP release fingerprint
dpkg-sig --verify dcp-provider-linux.deb
# expected: "GOODSIG _gpgbuilder DCP Release Engineering <releases@dcp.sa>"
```

These three commands go into the provider onboarding docs under a "verify before install" section — optional for casual users, mandatory in the enterprise/fleet-deploy guide.

---

## 7. Key-rotation and incident response

**Routine rotation:**
- Windows EV cert: re-enrol 30 days before expiry. New cert means re-signing any binaries that enterprises will validate at install time (but previously installed ones continue working).
- Apple Developer ID: re-enrol annually. Notarization tickets do not expire once stapled.
- GPG subkey: rotate every 2 years. Publish new subkey signed by master.

**Compromise response (runbook):**
1. Notify CA (SSL.com / Apple) within 24h; request revocation.
2. Add compromised cert/key fingerprint to `docs/SECURITY.md` as revoked.
3. Rebuild + re-sign every currently-distributed binary with new cert.
4. Push CRL/OCSP awareness via provider update channel (the daemon already auto-updates from api.dcp.sa; add a forced update for crypto rotations).
5. Post-mortem: RCA within 7 days. Publish to dcp.sa/security.

---

## 8. Delivery phases

**Phase 1 — before first signed release (blocking on founder cert purchase):**
- [ ] Acquire Windows EV cert (SSL.com eSigner recommended)
- [ ] Enroll Apple Developer Program
- [ ] Generate GPG master + subkey; provision YubiKey
- [ ] Store all credentials in 1Password (not repo)

**Phase 2 — CI wiring (can start on a branch today):**
- [ ] Add `.github/workflows/release-windows.yml`, `release-macos.yml`, `release-linux.yml` skeletons
- [ ] Add placeholder `daemon.entitlements`
- [ ] Add `docs/SECURITY.md` with published GPG fingerprint + verification commands
- [ ] Add verification section to provider onboarding docs

**Phase 3 — first signed release:**
- [ ] Cut `v4.1.0-signed` tag
- [ ] Run all three workflows; publish to GitHub Releases
- [ ] Update install.sh to fetch signed artifact + verify signature before executing
- [ ] Update wizard download-page copy to drop "ignore SmartScreen warning" workaround

**Phase 4 — ongoing:**
- Every release is signed, or it does not publish. CI gates this — no manual override.
- Quarterly: rotate TOTP secret, audit GitHub secrets access log, verify cert expiry >60d away.

---

## 9. What this plan explicitly does not do

- Does not purchase certificates. That is a founder credit-card action.
- Does not commit keys, PFX, p12, or any cert material. Ever.
- Does not modify the existing `.ps1` / `.sh` installer auto-exec scripts (Peter's standing rule).
- Does not deploy anything to production VPS (Peter's standing rule — no agent deploys without approval).
- Does not implement auto-update signature verification inside the daemon itself. That is a separate design (see future `docs/DAEMON-AUTO-UPDATE-DESIGN.md`).

---

## 10. Open questions for founder

1. **EV vs OV for Windows?** EV is recommended; costs ~2.5× more.
2. **Apple enrollment: individual or organization?** Organization requires D-U-N-S but lets the cert survive founder handover. Individual is faster (24-48h vs 2-3 weeks) and cheaper to set up.
3. **GPG master-key custody?** YubiKey + safe deposit box is the rigorous answer. Laptop-and-encrypted-USB is pragmatic but less robust against device loss.
4. **Include signing in a bundled "DEPLOY REQUEST" PR?** Or ship cert purchase + CI wiring as a separate milestone after v4.1.0 hits main?

---

*This plan tracks the work but does not execute it. All certificate purchases, CI secret configuration, and first-signing events are gated on founder sign-off per the standing deployment-approval rule.*
