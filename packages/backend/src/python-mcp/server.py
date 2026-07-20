"""Python MCP POC server.

Proves a Python-SDK MCP server, running in its own Docker container, can be
registered as an McpProvider by the Node backend over streamable HTTP.

Calls this backend's own APIs — /v1/m2m/process* (see m2m.routes.ts) and
/v1/edocs/* (see edocs.routes.ts) — rather than talking to Operaton or eDOCS
directly, the same "call the backend's own API, not the upstream system"
principle already used by the Node mcp-servers (see
src/mcp-servers/edocs/index.ts). Covering two unrelated upstream systems
through the same container/client/auth plumbing is the point: it proves the
architecture generalizes, not just that one route works.

eDOCS tools are read-only, matching the exact policy already applied to the
Node EdocsMcpProvider — only the 4 live-tested GET routes, no upload/delete.
"""

import os

import httpx
from mcp.server.fastmcp import FastMCP

import auth

BACKEND_BASE_URL = os.environ.get("BACKEND_BASE_URL", "http://host.docker.internal:3002")
M2M_BASE_URL = f"{BACKEND_BASE_URL}/v1/m2m"
EDOCS_BASE_URL = f"{BACKEND_BASE_URL}/v1/edocs"

mcp = FastMCP("python-mcp-poc", host="0.0.0.0", port=8765)


async def _get(base_url: str, path: str) -> dict:
    token = await auth.get_token()
    url = f"{base_url}{path}"

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
    return await _get(M2M_BASE_URL, "/process")


@mcp.tool()
async def process_status(instance_id: str) -> dict:
    """Get the status of a single process instance, given its id."""
    return await _get(M2M_BASE_URL, f"/process/{instance_id}/status")


@mcp.tool()
async def workspace_list() -> dict:
    """List workspaces (folders) in the configured eDOCS library."""
    return await _get(EDOCS_BASE_URL, "/workspaces")


@mcp.tool()
async def workspace_documents(workspace_id: str) -> dict:
    """List a workspace's content (documents and any sub-items), given its id."""
    return await _get(EDOCS_BASE_URL, f"/workspaces/{workspace_id}/documents")


@mcp.tool()
async def document_profile(document_id: str) -> dict:
    """Get the full metadata profile for a single document by its id."""
    return await _get(EDOCS_BASE_URL, f"/documents/{document_id}/profile")


@mcp.tool()
async def document_versions(document_id: str) -> dict:
    """List the version history for a document, given its id."""
    return await _get(EDOCS_BASE_URL, f"/documents/{document_id}/versions")


if __name__ == "__main__":
    mcp.run(transport="streamable-http")
