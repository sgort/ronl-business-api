import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import axios, { AxiosInstance } from 'axios';

// This server calls the RONL Business API's own, already-proven /v1/edocs/*
// HTTP surface (the same routes test-edocs-live.sh exercises and Copilot
// Studio is meant to call) rather than talking to the OpenText eDOCS DM
// server directly — EdocsService stays the single place that knows eDOCS'
// auth/quirks. Only the tools listed here have live-tested backend routes;
// no tool is added on the basis of the OpenAPI spec alone.

const KEYCLOAK_URL = process.env.KEYCLOAK_URL ?? 'http://localhost:8080';
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM ?? 'ronl';
const CLIENT_ID = process.env.EDOCS_MCP_CLIENT_ID ?? 'edocs-mcp-client';
const CLIENT_SECRET = process.env.EDOCS_MCP_CLIENT_SECRET ?? '';
const BACKEND_BASE_URL =
  process.env.EDOCS_MCP_BACKEND_URL ?? `http://localhost:${process.env.PORT ?? '3002'}`;

const backend: AxiosInstance = axios.create({
  baseURL: `${BACKEND_BASE_URL}/v1/edocs`,
  timeout: 15_000,
});

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const response = await axios.post(
    `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`,
    new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  const accessToken: string = response.data?.access_token;
  const expiresIn: number = response.data?.expires_in ?? 300;
  if (!accessToken) {
    throw new Error('Keycloak token response contained no access_token');
  }

  // Refresh 30s early so a call never races an about-to-expire token.
  cachedToken = { token: accessToken, expiresAt: Date.now() + (expiresIn - 30) * 1000 };
  return accessToken;
}

async function callBackend<T>(path: string): Promise<T> {
  const token = await getToken();
  try {
    const response = await backend.get(path, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data?.data as T;
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 401 || status === 403) {
      cachedToken = null;
      const token2 = await getToken();
      const response = await backend.get(path, {
        headers: { Authorization: `Bearer ${token2}` },
      });
      return response.data?.data as T;
    }
    throw err;
  }
}

// ── Tool definitions ───────────────────────────────────────────────────────
// One tool per live-tested read-only /v1/edocs/* route (see
// docs/en/ronl-business-api/developer/testing/edocs-live-testing.md). No
// write operations (upload/ensure/delete) are exposed to the LLM.

const TOOLS = [
  {
    name: 'workspace_list',
    description: 'List workspaces (folders) in the configured eDOCS library.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'workspace_documents',
    description: "List a workspace's content (documents and any sub-items), given its id.",
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'Workspace id to list contents for.' },
      },
      required: ['workspaceId'],
    },
  },
  {
    name: 'document_profile',
    description: 'Get the full metadata profile for a single document by its id.',
    inputSchema: {
      type: 'object',
      properties: {
        documentId: { type: 'string', description: 'Document id to fetch the profile for.' },
      },
      required: ['documentId'],
    },
  },
  {
    name: 'document_versions',
    description: 'List the version history for a document, given its id.',
    inputSchema: {
      type: 'object',
      properties: {
        documentId: { type: 'string', description: 'Document id to list versions for.' },
      },
      required: ['documentId'],
    },
  },
];

// ── Server ─────────────────────────────────────────────────────────────────

const server = new Server({ name: 'edocs-mcp', version: '1.0.0' }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  try {
    switch (name) {
      case 'workspace_list': {
        const result = await callBackend('/workspaces');
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'workspace_documents': {
        const workspaceId = args['workspaceId'] as string | undefined;
        if (!workspaceId) {
          return {
            content: [{ type: 'text', text: 'Error: workspaceId is required' }],
            isError: true,
          };
        }
        const result = await callBackend(`/workspaces/${workspaceId}/documents`);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'document_profile': {
        const documentId = args['documentId'] as string | undefined;
        if (!documentId) {
          return {
            content: [{ type: 'text', text: 'Error: documentId is required' }],
            isError: true,
          };
        }
        const result = await callBackend(`/documents/${documentId}/profile`);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'document_versions': {
        const documentId = args['documentId'] as string | undefined;
        if (!documentId) {
          return {
            content: [{ type: 'text', text: 'Error: documentId is required' }],
            isError: true,
          };
        }
        const result = await callBackend(`/documents/${documentId}/versions`);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
void (async () => {
  await server.connect(transport);
})();
