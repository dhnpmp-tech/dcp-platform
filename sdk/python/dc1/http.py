"""Low-level HTTP transport for the DC1 SDK."""
from __future__ import annotations
import json
import urllib.request
import urllib.error
from typing import Any, Optional

from .exceptions import APIError, AuthError


class HttpClient:
    """Minimal HTTP client using only stdlib (no httpx/requests dependency)."""

    def __init__(self, api_key: str, base_url: str, timeout: int = 30):
        self.api_key = api_key
        self.base_url = base_url.rstrip('/')
        self.timeout = timeout

    def _request(self, method: str, path: str, body: Optional[dict] = None, params: Optional[dict] = None) -> Any:
        url = self.base_url + path
        if params:
            query = '&'.join(f'{k}={v}' for k, v in params.items())
            url = f'{url}?{query}'

        data = json.dumps(body).encode() if body is not None else None
        headers = {
            'Content-Type': 'application/json',
            'x-renter-key': self.api_key,
            'User-Agent': 'dc1-python/0.1.0',
        }

        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                raw = resp.read().decode()
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as e:
            raw = e.read().decode()
            try:
                payload = json.loads(raw)
            except Exception:
                payload = {'error': raw or str(e)}

            if e.code == 401:
                raise AuthError(payload.get('error', 'Unauthorized')) from e
            raise APIError(
                payload.get('error', f'HTTP {e.code}'),
                status_code=e.code,
                response=payload,
            ) from e
        except urllib.error.URLError as e:
            raise APIError(f'Connection error: {e.reason}') from e

    def get(self, path: str, params: Optional[dict] = None) -> Any:
        return self._request('GET', path, params=params)

    def post(self, path: str, body: Optional[dict] = None) -> Any:
        return self._request('POST', path, body=body)

    def delete(self, path: str, body: Optional[dict] = None) -> Any:
        return self._request('DELETE', path, body=body)
