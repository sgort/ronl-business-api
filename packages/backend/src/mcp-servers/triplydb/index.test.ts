/**
 * Unit tests for the standalone TriplyDB SPARQL MCP server. The module has no
 * exports and self-connects on import, so the MCP SDK is mocked to capture its
 * request handlers, global fetch is mocked, and TRIPLYDB_TOKEN is set before
 * requiring it (to exercise the bearer-auth branch).
 */

// This file has no top-level import, so TypeScript would otherwise treat it as
// a global script and hoist every top-level declaration below into the global
// scope — where `mockAxios`, `Mod`, `freshModule` and friends collide with the
// identically-named declarations in sibling test files. `export {}` makes it a
// module and scopes them to this file.
export {};

const mockServer = {
  setRequestHandler: jest.fn(),
  connect: jest.fn().mockResolvedValue(undefined),
};

jest.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: jest.fn(() => mockServer),
}));
jest.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({ StdioServerTransport: jest.fn() }));
jest.mock('@modelcontextprotocol/sdk/types.js', () => ({
  CallToolRequestSchema: 'CallTool',
  ListToolsRequestSchema: 'ListTools',
}));

const mockFetch = jest.fn();
(global as unknown as { fetch: jest.Mock }).fetch = mockFetch;

type Handler = (req: { params: { name: string; arguments?: Record<string, unknown> } }) => Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

let listTools: () => Promise<{ tools: Array<{ name: string }> }>;
let callTool: Handler;

const DEFAULT_ENDPOINT =
  'https://api.open-regels.triply.cc/datasets/stevengort/RONL/services/RONL/sparql';

beforeAll(() => {
  process.env.TRIPLYDB_TOKEN = 'tok-123';
  delete process.env.TRIPLYDB_ENDPOINT;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('./index'); // side-effectful: registers handlers on mockServer
  const calls = mockServer.setRequestHandler.mock.calls;
  listTools = calls.find((c) => c[0] === 'ListTools')![1];
  callTool = calls.find((c) => c[0] === 'CallTool')![1];
});

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => '{"ok":1}',
  });
});

const call = (name: string, args: Record<string, unknown> = {}) =>
  callTool({ params: { name, arguments: args } });
const textOf = (res: { content: Array<{ text: string }> }) => res.content[0].text;

/** Decode the SPARQL query out of the last fetch's form-encoded body. */
const lastQuery = (): string => {
  const body = (mockFetch.mock.calls.at(-1)![1] as { body: string }).body;
  return decodeURIComponent(body.replace(/^query=/, ''));
};
const lastUrl = () => mockFetch.mock.calls.at(-1)![0] as string;
const lastHeaders = () =>
  (mockFetch.mock.calls.at(-1)![1] as { headers: Record<string, string> }).headers;

describe('ListTools', () => {
  it('advertises all eleven TriplyDB tools', async () => {
    const { tools } = await listTools();
    expect(tools).toHaveLength(11);
    expect(tools.map((t) => t.name)).toContain('sparql_query');
  });
});

describe('query routing — each tool builds and posts its SPARQL', () => {
  const cases: Array<[string, Record<string, unknown>, string]> = [
    ['dmn_list', {}, 'a cprmv:DecisionModel'],
    ['dmn_chain_links', {}, '?dmn1Identifier'],
    ['dmn_enhanced_chain_links', {}, '?matchType'],
    ['dmn_semantic_equivalences', {}, '?sharedConcept'],
    ['organization_list', {}, 'cv:PublicOrganisation'],
    ['service_list', {}, 'cpsv:PublicService'],
    ['rule_list', {}, 'cpsv:Rule'],
    ['concept_list', {}, 'skos:exactMatch ?exactMatch'],
    ['service_rules_metadata', {}, 'cprmv:rulesetId'],
  ];

  it.each(cases)('%s posts a query containing %s', async (name, args, needle) => {
    const res = await call(name, args);
    expect(textOf(res)).toBe('{"ok":1}');
    expect(lastQuery()).toContain(needle);
  });

  it('dmn_get by identifier binds the identifier into the query', async () => {
    await call('dmn_get', { identifier: 'tree-felling.dmn' });
    expect(lastQuery()).toContain('dct:identifier "tree-felling.dmn"');
  });

  it('dmn_get by uri binds the URI into the query', async () => {
    await call('dmn_get', { uri: 'https://example/dmn/1' });
    expect(lastQuery()).toContain('BIND(<https://example/dmn/1> AS ?dmn)');
  });

  it('dmn_get without uri or identifier is an error result (no fetch)', async () => {
    const res = await call('dmn_get', {});
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain('provide either uri or identifier');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('rule_list applies the optional service-title filter', async () => {
    await call('rule_list', { serviceTitle: 'Zorg' });
    expect(lastQuery()).toContain('CONTAINS(LCASE(STR(?serviceTitle)), LCASE("Zorg"))');
  });

  it('service_rules_metadata applies the optional service-id filter', async () => {
    await call('service_rules_metadata', { serviceId: 'svc-1' });
    expect(lastQuery()).toContain('FILTER(?serviceId = "svc-1")');
  });

  it('sparql_query forwards the raw query verbatim', async () => {
    await call('sparql_query', { query: 'SELECT * WHERE { ?s ?p ?o }' });
    expect(lastQuery()).toBe('SELECT * WHERE { ?s ?p ?o }');
  });

  it('sparql_query without a query is an error result (no fetch)', async () => {
    const res = await call('sparql_query', {});
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain('query is required');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('endpoint + auth', () => {
  it('posts to the default endpoint with the bearer token', async () => {
    await call('dmn_list');
    expect(lastUrl()).toBe(DEFAULT_ENDPOINT);
    expect(lastHeaders()['Authorization']).toBe('Bearer tok-123');
  });

  it('honours a per-call endpoint override', async () => {
    await call('dmn_list', { endpoint: 'https://other/sparql' });
    expect(lastUrl()).toBe('https://other/sparql');
  });
});

describe('error handling', () => {
  it('unknown tool → error result', async () => {
    const res = await call('nope');
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain('Unknown tool: nope');
  });

  it('a non-ok HTTP response is surfaced as an error result', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      text: async () => '',
    });
    const res = await call('dmn_list');
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain('Error: HTTP 502 Bad Gateway');
  });

  it('a network failure is caught and returned as an error result', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
    const res = await call('dmn_list');
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain('Error: ECONNREFUSED');
  });
});
