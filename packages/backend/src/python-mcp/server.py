"""Python MCP POC server.

Proves a Python-SDK MCP server, running in its own Docker container, can be
registered as an McpProvider by the Node backend over streamable HTTP.

Calls this backend's own /v1/m2m/process* routes (see m2m.routes.ts) rather
than talking to Operaton directly — the same "call the backend's own API,
not the upstream system" principle already used by the Node mcp-servers
(see src/mcp-servers/edocs/index.ts).
"""

import os

import httpx
from mcp.server.fastmcp import FastMCP

import auth

BACKEND_BASE_URL = os.environ.get("BACKEND_BASE_URL", "http://host.docker.internal:3002")
M2M_BASE_URL = f"{BACKEND_BASE_URL}/v1/m2m"

mcp = FastMCP("python-mcp-poc", host="0.0.0.0", port=8765)


async def _call_backend(path: str) -> dict:
    token = await auth.get_token()
    url = f"{M2M_BASE_URL}{path}"

    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(url, headers={"Authorization": f"Bearer {token}"})
        if response.status_code in (401, 403):
            auth.invalidate_token()
            token = await auth.get_token()
            response = await client.get(url, headers={"Authorization": f"Bearer {token}"})
        response.raise_for_status()
        return response.json()


@mcp.tool()
async def process_list() -> dict:
    """List active Operaton process instances (no tenant filter)."""
    return await _call_backend("/process")


@mcp.tool()
async def process_status(instance_id: str) -> dict:
    """Get the status of a single process instance, given its id."""
    return await _call_backend(f"/process/{instance_id}/status")


if __name__ == "__main__":
    mcp.run(transport="streamable-http")
