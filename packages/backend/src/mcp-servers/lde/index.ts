import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { Pool } from 'pg';

const DATABASE_URL = process.env.LDE_DATABASE_URL ?? '';

let pool: Pool | null = null;
if (DATABASE_URL) {
  const sslRequired = /sslmode=(require|verify-full|verify-ca|prefer)/.test(DATABASE_URL);
  const cleanUrl = DATABASE_URL.replace(/[?&]sslmode=[^&]+/, '').replace(/[?&]$/, '');
  pool = new Pool({
    connectionString: cleanUrl,
    ssl: sslRequired ? { rejectUnauthorized: true } : false,
  });
}

async function query<T extends Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  if (!pool) throw new Error('LDE database not configured');
  const { rows } = await pool.query<T>(sql, params);
  return rows;
}

// ── Tool definitions ───────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'bundle_list',
    description:
      'List all deployed process bundles from the LDE process library. Each bundle includes ' +
      'the BPMN process ID, name, description, process role (shell/standalone), status, ' +
      'deployment date, Operaton deployment ID, linked DMN template keys, deployed form IDs/names, ' +
      'deployed document IDs/names, and nested subprocesses. Only bundles with a deployment date are returned.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'bundle_get',
    description:
      'Get a single deployed process bundle by its BPMN process ID (e.g. "AwbZorgtoeslagProcess"). ' +
      'Returns the same fields as bundle_list but for one process only.',
    inputSchema: {
      type: 'object',
      properties: {
        bpmnProcessId: {
          type: 'string',
          description: 'The BPMN process ID to look up.',
        },
      },
      required: ['bpmnProcessId'],
    },
  },
  {
    name: 'form_list',
    description:
      'List all form schemas in the LDE. Returns id, name, description, and status for each form. ' +
      'Use form_get to retrieve the full JSON schema for a specific form.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'form_get',
    description:
      'Get a single form schema by its id, including the full JSON schema definition. ' +
      'The schema follows the Camunda Form schema format with components array.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Form schema id (matches camunda:formRef in BPMN).' },
      },
      required: ['id'],
    },
  },
  {
    name: 'document_list',
    description:
      'List all document templates in the LDE. Returns id, name, description, process_key, ' +
      'service_id, and status for each template. Use document_get for full template details.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'document_get',
    description:
      'Get a single document template by its id, including zones (layout sections), ' +
      'bindings (variable-to-field mappings), and status.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Document template id (matches ronl:documentRef in BPMN).',
        },
      },
      required: ['id'],
    },
  },
];

// ── SQL ────────────────────────────────────────────────────────────────────

const BUNDLE_SELECT = `
  SELECT pd_shell.lde_id,
         pd_shell.bpmn_process_id,
         pd_shell.name,
         pd_shell.description,
         pd_shell.process_role,
         pd_shell.linked_dmn_templates,
         pd_shell.status,
         pd_shell.deployed_at,
         pd_shell.operaton_url,
         pd_shell.operaton_deployment_id,
         pd_shell.deployed_forms,
         pd_shell.deployed_documents,
         pd_shell.updated_at,
         COALESCE(
           json_agg(
             json_build_object(
               'id', pd_sub.lde_id,
               'name', pd_sub.name,
               'bpmnProcessId', pd_sub.bpmn_process_id,
               'status', pd_sub.status
             )
           ) FILTER (WHERE pd_sub.lde_id IS NOT NULL),
           '[]'
         ) AS subprocesses,
         COALESCE(
           (SELECT json_agg(json_build_object('id', fs.schema->>'id', 'name', fs.name))
            FROM form_schemas fs
            WHERE fs.schema->>'id' = ANY(pd_shell.deployed_forms)),
           '[]'
         ) AS forms,
         COALESCE(
           (SELECT json_agg(json_build_object('id', dt.id, 'name', dt.name))
            FROM document_templates dt
            WHERE dt.id = ANY(pd_shell.deployed_documents)),
           '[]'
         ) AS documents
  FROM process_definitions pd_shell
  LEFT JOIN process_definitions pd_sub
    ON pd_sub.called_element = pd_shell.bpmn_process_id
   AND pd_sub.process_role   = 'subprocess'
  WHERE pd_shell.process_role IN ('shell', 'standalone')
    AND pd_shell.deployed_at IS NOT NULL`;

function mapBundle(r: Record<string, unknown>) {
  return {
    id: r['lde_id'],
    bpmnProcessId: r['bpmn_process_id'],
    name: r['name'],
    description: r['description'] ?? null,
    processRole: r['process_role'],
    status: r['status'],
    deployedAt: r['deployed_at'],
    operatonUrl: r['operaton_url'] ?? null,
    operatonDeploymentId: r['operaton_deployment_id'] ?? null,
    linkedDmnTemplates: r['linked_dmn_templates'] ?? [],
    deployedForms: r['forms'],
    deployedDocuments: r['documents'],
    subprocesses: r['subprocesses'],
  };
}

// ── Server ─────────────────────────────────────────────────────────────────

const server = new Server({ name: 'lde-mcp', version: '1.0.0' }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  try {
    switch (name) {
      case 'bundle_list': {
        const rows = await query(
          `${BUNDLE_SELECT} GROUP BY pd_shell.lde_id, pd_shell.bpmn_process_id, pd_shell.name,
             pd_shell.description, pd_shell.process_role, pd_shell.linked_dmn_templates,
             pd_shell.status, pd_shell.deployed_at, pd_shell.operaton_url,
             pd_shell.operaton_deployment_id, pd_shell.deployed_forms,
             pd_shell.deployed_documents, pd_shell.updated_at
           ORDER BY pd_shell.deployed_at DESC`
        );
        return { content: [{ type: 'text', text: JSON.stringify(rows.map(mapBundle), null, 2) }] };
      }

      case 'bundle_get': {
        const bpmnProcessId = args['bpmnProcessId'] as string;
        const rows = await query(
          `${BUNDLE_SELECT}
             AND pd_shell.bpmn_process_id = $1
           GROUP BY pd_shell.lde_id, pd_shell.bpmn_process_id, pd_shell.name,
             pd_shell.description, pd_shell.process_role, pd_shell.linked_dmn_templates,
             pd_shell.status, pd_shell.deployed_at, pd_shell.operaton_url,
             pd_shell.operaton_deployment_id, pd_shell.deployed_forms,
             pd_shell.deployed_documents, pd_shell.updated_at`,
          [bpmnProcessId]
        );
        if (rows.length === 0) {
          return {
            content: [{ type: 'text', text: `No deployed bundle found for: ${bpmnProcessId}` }],
            isError: true,
          };
        }
        return { content: [{ type: 'text', text: JSON.stringify(mapBundle(rows[0]), null, 2) }] };
      }

      case 'form_list': {
        const rows = await query(
          `SELECT schema->>'id' AS id, name, description, status
           FROM form_schemas ORDER BY name`
        );
        return { content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }] };
      }

      case 'form_get': {
        const id = args['id'] as string;
        const rows = await query(
          `SELECT schema->>'id' AS id, name, description, schema, status
           FROM form_schemas WHERE schema->>'id' = $1 LIMIT 1`,
          [id]
        );
        if (rows.length === 0) {
          return { content: [{ type: 'text', text: `Form not found: ${id}` }], isError: true };
        }
        return { content: [{ type: 'text', text: JSON.stringify(rows[0], null, 2) }] };
      }

      case 'document_list': {
        const rows = await query(
          `SELECT id, name, description, process_key, service_id, status
           FROM document_templates ORDER BY name`
        );
        return { content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }] };
      }

      case 'document_get': {
        const id = args['id'] as string;
        const rows = await query(
          `SELECT id, name, description, process_key, service_id, zones, bindings, status
           FROM document_templates WHERE id = $1 LIMIT 1`,
          [id]
        );
        if (rows.length === 0) {
          return {
            content: [{ type: 'text', text: `Document template not found: ${id}` }],
            isError: true,
          };
        }
        return { content: [{ type: 'text', text: JSON.stringify(rows[0], null, 2) }] };
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
