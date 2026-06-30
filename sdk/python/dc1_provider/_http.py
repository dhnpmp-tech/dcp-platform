"""Internal HTTP transport for the dc1_provider SDK.

Uses only stdlib (urllib) — no third-party dependencies required.
Provider auth uses the ``x-provider-key`` header for POST endpoints and
the ``?key=`` query param for GET endpoints (matching the backend contract).
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Optional

from .exceptions import AuthError, DC1APIError

_SDK_VERSION = "0.1.0"


def _sign_body(secret: str, raw_body: bytes) -> str:
    """HMAC-SHA256(raw_body, secret) → ``sha256=<hex>`` signature header value.

    Mirrors the backend ``verifyHeartbeatHmac`` contract in
    backend/src/routes/providers.js (X-DC1-Signature: sha256=<64 hex>).
    """
    digest = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


class _HttpClient:
    """Minimal stdlib-only HTTP client for the DC1 provider API."""

    def __init__(self, api_key: str, base_url: str, timeout: int):
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout
        # Optional request signing (C3 rollout). When DC1_HMAC_SECRET is present
        # in the daemon's env, every request carries X-DC1-Signature over the
        # raw body. The backend ignores the signature while
        # DC1_REQUIRE_HEARTBEAT_HMAC=0, so this is safe to ship ahead of the
        # enforcement flip — it just primes the telemetry so daemons show up as
        # "signing" the moment the flag is turned on.
        self._hmac_secret = os.environ.get("DC1_HMAC_SECRET")

    # ------------------------------------------------------------------
    # Public helpers
    # ------------------------------------------------------------------

    def get(self, path: str, params: Optional[dict] = None) -> Any:
        """GET request.  Injects ``?key=`` auth param automatically."""
        p = dict(params or {})
        p["key"] = self._api_key
        return self._request("GET", path, params=p)

    def post(self, path: str, body: Optional[dict] = None, *, auth_header: bool = True) -> Any:
        """POST request.  Injects ``x-provider-key`` header when *auth_header* is True."""
        return self._request("POST", path, body=body, auth_header=auth_header)

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _request(
        self,
        method: str,
        path: str,
        body: Optional[dict] = None,
        params: Optional[dict] = None,
        auth_header: bool = True,
    ) -> Any:
        url = self._base_url + path
        if params:
            url = url + "?" + urllib.parse.urlencode(params)

        data = json.dumps(body).encode() if body is not None else None
        headers: dict[str, str] = {
            "Content-Type": "application/json",
            "User-Agent": f"dc1-provider-python/{_SDK_VERSION}",
        }
        if auth_header:
            headers["x-provider-key"] = self._api_key
        if self._hmac_secret:
            # Sign the exact bytes on the wire (empty body → b"" so GETs and
            # bodyless POSTs are covered too). Constant-time compare happens
            # server-side via crypto.timingSafeEqual.
            raw_body = data if data is not None else b""
            headers["X-DC1-Signature"] = _sign_body(self._hmac_secret, raw_body)

        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=self._timeout) as resp:
                raw = resp.read().decode()
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as exc:
            raw = exc.read().decode()
            try:
                payload = json.loads(raw)
            except Exception:
                payload = {"error": raw or str(exc)}

            msg = payload.get("error", f"HTTP {exc.code}")
            if exc.code in (401, 403):
                raise AuthError(msg, status_code=exc.code, response=payload) from exc
            raise DC1APIError(msg, status_code=exc.code, response=payload) from exc
        except urllib.error.URLError as exc:
            raise DC1APIError(f"Connection error: {exc.reason}") from exc
