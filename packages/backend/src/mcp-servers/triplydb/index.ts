import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const ENDPOINT = process.env.TRIPLYDB_ENDPOINT ?? '';
const TOKEN = process.env.TRIPLYDB_TOKEN ?? '';

const server = new Server(
  { name: 'triplydb-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'sparql_query',
      description:
        'Execute a SPARQL SELECT query against a TriplyDB endpoint. ' +
        'Use this to find decision models, public services, organisations, concepts, and rules ' +
        'in the RONL knowledge graph.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'A valid SPARQL 1.1 SELECT query',
          },
          endpoint: {
            type: 'string',
            description: 'SPARQL endpoint URL. Omit to use the default configured endpoint.',
          },
        },
        required: ['query'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  if (name === 'sparql_query') {
    const query = args['query'] as string;
    const endpoint = (args['endpoint'] as string | undefined) ?? ENDPOINT;

    if (!endpoint) {
      return {
        content: [{ type: 'text', text: 'Error: no SPARQL endpoint configured or provided' }],
        isError: true,
      };
    }

    try {
      const result = await executeSparql(endpoint, query, TOKEN || undefined);
      return { content: [{ type: 'text', text: result }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: 'text', text: `SPARQL error: ${message}` }], isError: true };
    }
  }

  return {
    content: [{ type: 'text', text: `Unknown tool: ${name}` }],
    isError: true,
  };
});

async function executeSparql(endpoint: string, query: string, token?: string): Promise<string> {
  const headers: Record<string, string> = {
    Accept: 'application/sparql-results+json',
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: `query=${encodeURIComponent(query)}`,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  return response.text();
}

const transport = new StdioServerTransport();
void (async () => {
  await server.connect(transport);
})();
