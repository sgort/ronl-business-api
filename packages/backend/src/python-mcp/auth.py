"""Keycloak client_credentials token fetch with early-refresh caching.

Mirrors getToken() in src/mcp-servers/edocs/index.ts: cache the access
token, refresh 30s before it actually expires so a call never races an
about-to-expire token, and let the caller invalidate on 401/403 to force
one retry with a fresh token.
"""

import os
import time
from typing import Optional

import httpx

KEYCLOAK_URL = os.environ.get("KEYCLOAK_URL", "http://localhost:8080")
KEYCLOAK_REALM = os.environ.get("KEYCLOAK_REALM", "ronl")
CLIENT_ID = os.environ.get("PYTHON_MCP_CLIENT_ID", "python-mcp-poc-client")
CLIENT_SECRET = os.environ.get("PYTHON_MCP_CLIENT_SECRET", "")

_cached_token: Optional[str] = None
_expires_at: float = 0.0


async def get_token() -> str:
    """Return a cached access token, fetching a new one if expired."""
    global _cached_token, _expires_at

    if _cached_token and time.monotonic() < _expires_at:
        return _cached_token

    token_url = f"{KEYCLOAK_URL}/realms/{KEYCLOAK_REALM}/protocol/openid-connect/token"
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(
            token_url,
            data={
                "grant_type": "client_credentials",
                "client_id": CLIENT_ID,
                "client_secret": CLIENT_SECRET,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        response.raise_for_status()
        payload = response.json()

    access_token = payload.get("access_token")
    expires_in = payload.get("expires_in", 300)
    if not access_token:
        raise RuntimeError("Keycloak token response contained no access_token")

    _cached_token = access_token
    _expires_at = time.monotonic() + expires_in - 30
    return _cached_token


def invalidate_token() -> None:
    """Force the next get_token() call to fetch a fresh token."""
    global _cached_token, _expires_at
    _cached_token = None
    _expires_at = 0.0
