/**
 * Unit tests for the standalone LDE MCP server. The module has no exports and
 * self-connects on import, so the MCP SDK is mocked to capture its request
 * handlers, pg is mocked, and LDE_DATABASE_URL is set before requiring it.
 */

const mockServer = {
  setRequestHandler: jest.fn(),
  connect: jest.fn().mockResolvedValue(undefined),
};
const mockPoolQuery = jest.fn();

jest.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: jest.fn(() => mockServer),
}));
jest.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({ StdioServerTransport: jest.fn() }));
jest.mock('@modelcontextprotocol/sdk/types.js', () => ({
  CallToolRequestSchema: 'CallTool',
  ListToolsRequestSchema: 'ListTools',
}));
jest.mock('pg', () => ({ Pool: jest.fn(() => ({ query: mockPoolQuery })) }));

type Handler = (req: { params: { name: string; arguments?: Record<string, unknown> } }) => Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

let listTools: () => Promise<{ tools: Array<{ name: string }> }>;
let callTool: Handler;

beforeAll(() => {
  process.env.LDE_DATABASE_URL = 'postgres://u:p@host/db?sslmode=require';
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('./index'); // side-effectful: registers handlers on mockServer
  const calls = mockServer.setRequestHandler.mock.calls;
  listTools = calls.find((c) => c[0] === 'ListTools')![1];
  callTool = calls.find((c) => c[0] === 'CallTool')![1];
});

beforeEach(() => mockPoolQuery.mockReset());

const call = (name: string, args: Record<string, unknown> = {}) =>
  callTool({ params: { name, arguments: args } });
const textOf = (res: { content: Array<{ text: string }> }) => res.content[0].text;

describe('ListTools', () => {
  it('advertises the six LDE tools', async () => {
    const { tools } = await listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'bundle_get',
      'bundle_list',
      'document_get',
      'document_list',
      'form_get',
      'form_list',
    ]);
  });
});

describe('bundle tools', () => {
  it('bundle_list maps rows to the bundle shape', async () => {
    mockPoolQuery.mockResolvedValue({
      rows: [{ lde_id: '1', bpmn_process_id: 'AwbProc', name: 'AWB', status: 'deployed' }],
    });
    const res = await call('bundle_list');
    const parsed = JSON.parse(textOf(res));
    expect(parsed[0]).toMatchObject({ id: '1', bpmnProcessId: 'AwbProc', name: 'AWB' });
    expect(mockPoolQuery.mock.calls[0][0]).toContain('FROM process_definitions');
  });

  it('bundle_get returns the mapped bundle by id', async () => {
    mockPoolQuery.mockResolvedValue({
      rows: [{ lde_id: '2', bpmn_process_id: 'P2', name: 'Two' }],
    });
    const res = await call('bundle_get', { bpmnProcessId: 'P2' });
    expect(JSON.parse(textOf(res))).toMatchObject({ bpmnProcessId: 'P2', name: 'Two' });
    expect(mockPoolQuery.mock.calls[0][1]).toEqual(['P2']);
  });

  it('bundle_get returns an error result when not found', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [] });
    const res = await call('bundle_get', { bpmnProcessId: 'nope' });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain('No deployed bundle found for: nope');
  });
});

describe('form + document tools', () => {
  it('form_list returns the rows', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [{ id: 'f1', name: 'Form 1' }] });
    expect(JSON.parse(textOf(await call('form_list')))).toEqual([{ id: 'f1', name: 'Form 1' }]);
  });

  it('form_get returns an error when not found', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [] });
    const res = await call('form_get', { id: 'x' });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain('Form not found: x');
  });

  it('document_list returns the rows', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [{ id: 'd1', name: 'Doc 1' }] });
    expect(JSON.parse(textOf(await call('document_list')))).toEqual([{ id: 'd1', name: 'Doc 1' }]);
  });

  it('document_get returns an error when not found', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [] });
    const res = await call('document_get', { id: 'x' });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain('Document template not found: x');
  });

  it('document_get returns the row when found', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [{ id: 'd1', name: 'Doc', zones: [], bindings: [] }] });
    const res = await call('document_get', { id: 'd1' });
    expect(JSON.parse(textOf(res))).toMatchObject({ id: 'd1', name: 'Doc' });
  });
});

describe('error handling', () => {
  it('unknown tool → error result', async () => {
    const res = await call('nope');
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain('Unknown tool: nope');
  });

  it('a query failure is caught and returned as an error result', async () => {
    mockPoolQuery.mockRejectedValue(new Error('db exploded'));
    const res = await call('bundle_list');
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain('Error: db exploded');
  });
});
