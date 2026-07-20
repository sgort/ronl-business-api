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

The AI-Assistant-facing eDOCS tools are read-only, matching the exact policy
already applied to the Node EdocsMcpProvider — only the 4 live-tested GET
routes are allow-listed for chat (see PythonPocMcpProvider.ts ALLOWED_TOOLS).
document_upload and document_download also exist here, callable over raw MCP,
but are deliberately NOT allow-listed for chat — they exist so
scripts/test-edocs-live.sh can prove this MCP route creates and reads back
its own document too, independent of the direct /v1/edocs route, without
reopening the "no write tools in chat" decision.
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


async def _post(base_url: str, path: str, json_body: dict) -> dict:
    token = await auth.get_token()
    url = f"{base_url}{path}"

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(url, json=json_body, headers={"Authorization": f"Bearer {token}"})
        if response.status_code in (401, 403):
            auth.invalidate_token()
            token = await auth.get_token()
            response = await client.post(url, json=json_body, headers={"Authorization": f"Bearer {token}"})
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


@mcp.tool()
async def document_upload(filename: str, content_base64: str, doc_name: str, department: str) -> dict:
    """Upload a new standalone document to eDOCS (no workspace ref — the only
    confirmed-working upload path). Returns the created document's id and
    documentNumber. Not exposed to the AI Assistant chat (see
    PythonPocMcpProvider.ts ALLOWED_TOOLS) — exists so
    scripts/test-edocs-live.sh can prove this MCP route creates its own
    document too, independent of the direct /v1/edocs route."""
    return await _post(
        EDOCS_BASE_URL,
        "/documents",
        {
            "filename": filename,
            "contentBase64": content_base64,
            "metadata": {"docName": doc_name, "department": department},
        },
    )


@mcp.tool()
async def document_download(document_id: str, version: str = "0") -> dict:
    """Download a document version's raw content (base64-encoded). "0" is the
    confirmed-working "current version" sentinel. Not exposed to the AI
    Assistant chat — same reasoning as EdocsMcpProvider not exposing
    download (base64 payloads don't belong in an LLM context); exists for
    scripts/test-edocs-live.sh's content round-trip verification."""
    return await _get(EDOCS_BASE_URL, f"/documents/{document_id}/versions/{version}")


if __name__ == "__main__":
    mcp.run(transport="streamable-http")
