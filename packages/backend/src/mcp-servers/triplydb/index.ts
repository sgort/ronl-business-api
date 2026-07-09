import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const ENDPOINT =
  process.env.TRIPLYDB_ENDPOINT ??
  'https://api.open-regels.triply.cc/datasets/stevengort/RONL/services/RONL/sparql';
const TOKEN = process.env.TRIPLYDB_TOKEN ?? '';

const PREFIXES = `
PREFIX cv:     <http://data.europa.eu/m8g/>
PREFIX rdf:    <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX skos:   <http://www.w3.org/2004/02/skos/core#>
PREFIX dct:    <http://purl.org/dc/terms/>
PREFIX foaf:   <http://xmlns.com/foaf/0.1/>
PREFIX cpsv:   <http://purl.org/vocab/cpsv#>
PREFIX eli:    <http://data.europa.eu/eli/ontology#>
PREFIX ronl:   <https://regels.overheid.nl/ontology#>
PREFIX cprmv:  <https://cprmv.open-regels.nl/0.3.0/>
PREFIX cprmv041: <https://standaarden.open-regels.nl/standards/cprmv/0.4.1#>
PREFIX schema: <http://schema.org/>
`;

// ── Tool definitions ───────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'dmn_list',
    description:
      'List all decision models (DMNs) in the knowledge graph with their identifiers, titles, ' +
      'API endpoints, deployment IDs, and linked public services.',
    inputSchema: {
      type: 'object',
      properties: {
        endpoint: { type: 'string', description: 'Override the default SPARQL endpoint URL.' },
      },
    },
  },
  {
    name: 'dmn_get',
    description:
      'Get full details for a specific DMN including all input and output variables with ' +
      'types, descriptions, and test values. Provide either the DMN URI or its identifier.',
    inputSchema: {
      type: 'object',
      properties: {
        uri: { type: 'string', description: 'Full URI of the DMN resource.' },
        identifier: {
          type: 'string',
          description: 'dct:identifier value of the DMN (e.g. "tree-felling-decision.dmn").',
        },
        endpoint: { type: 'string', description: 'Override the default SPARQL endpoint URL.' },
      },
    },
  },
  {
    name: 'dmn_chain_links',
    description:
      'Find all variable-level chain connections between DMNs — which DMN outputs feed ' +
      'which DMN inputs (exact identifier match, type-compatible).',
    inputSchema: {
      type: 'object',
      properties: {
        endpoint: { type: 'string', description: 'Override the default SPARQL endpoint URL.' },
      },
    },
  },
  {
    name: 'dmn_enhanced_chain_links',
    description:
      'Find chain links between DMNs using both exact identifier matching and semantic ' +
      'matching via skos:exactMatch. Returns matchType: "exact" | "semantic" | "both".',
    inputSchema: {
      type: 'object',
      properties: {
        endpoint: { type: 'string', description: 'Override the default SPARQL endpoint URL.' },
      },
    },
  },
  {
    name: 'dmn_semantic_equivalences',
    description:
      'Find variables across different DMNs that share the same skos:exactMatch concept URI, ' +
      'indicating semantic interoperability between models.',
    inputSchema: {
      type: 'object',
      properties: {
        endpoint: { type: 'string', description: 'Override the default SPARQL endpoint URL.' },
      },
    },
  },
  {
    name: 'organization_list',
    description:
      'List all public organisations in the knowledge graph with identifier, name, homepage, ' +
      'and logo. Uses cv:PublicOrganisation.',
    inputSchema: {
      type: 'object',
      properties: {
        endpoint: { type: 'string', description: 'Override the default SPARQL endpoint URL.' },
      },
    },
  },
  {
    name: 'service_list',
    description:
      'List all public services (cpsv:PublicService) with title, description, and competent authority.',
    inputSchema: {
      type: 'object',
      properties: {
        endpoint: { type: 'string', description: 'Override the default SPARQL endpoint URL.' },
      },
    },
  },
  {
    name: 'rule_list',
    description:
      'List implementation rules with their linked public services, validity dates, and confidence levels.',
    inputSchema: {
      type: 'object',
      properties: {
        serviceTitle: {
          type: 'string',
          description: 'Optional: filter rules by (partial) service title.',
        },
        endpoint: { type: 'string', description: 'Override the default SPARQL endpoint URL.' },
      },
    },
  },
  {
    name: 'concept_list',
    description:
      'List NL-SBB concepts (skos:Concept) with their skos:exactMatch URIs, linked variables, ' +
      'and the services and DMNs they relate to.',
    inputSchema: {
      type: 'object',
      properties: {
        endpoint: { type: 'string', description: 'Override the default SPARQL endpoint URL.' },
      },
    },
  },
  {
    name: 'service_rules_metadata',
    description:
      'Retrieve detailed rule metadata traversing cprmv:Rule → eli:LegalResource → cpsv:PublicService. ' +
      'Returns rulesetId, ruleIdPath, norm, situatie, and definition per rule.',
    inputSchema: {
      type: 'object',
      properties: {
        serviceId: {
          type: 'string',
          description: 'Optional: filter by service dct:identifier.',
        },
        endpoint: { type: 'string', description: 'Override the default SPARQL endpoint URL.' },
      },
    },
  },
  {
    name: 'sparql_query',
    description:
      'Execute an arbitrary SPARQL 1.1 SELECT query against a TriplyDB endpoint. ' +
      'Use this as an escape hatch when the dedicated tools do not cover the required query.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'A valid SPARQL 1.1 SELECT query.' },
        endpoint: {
          type: 'string',
          description: 'Override the default SPARQL endpoint URL.',
        },
      },
      required: ['query'],
    },
  },
];

// ── SPARQL queries ─────────────────────────────────────────────────────────

function dmnListQuery(): string {
  return `${PREFIXES}
SELECT DISTINCT ?dmn ?identifier ?title ?apiEndpoint ?deploymentId ?service ?serviceTitle
WHERE {
  ?dmn a cprmv:DecisionModel ;
       dct:identifier ?identifier ;
       dct:title ?title ;
       cprmv:implementedBy ?apiEndpoint .
  OPTIONAL { ?dmn cprmv:deploymentId ?deploymentId }
  OPTIONAL {
    ?dmn cpsv:implements ?service .
    OPTIONAL { ?service dct:title ?serviceTitle . FILTER(LANG(?serviceTitle) = "nl" || LANG(?serviceTitle) = "") }
  }
  FILTER(LANG(?title) = "nl" || LANG(?title) = "")
}
ORDER BY ?title`;
}

function dmnGetQuery(uri?: string, identifier?: string): string {
  const filter = uri ? `BIND(<${uri}> AS ?dmn)` : `?dmn dct:identifier "${identifier}" .`;

  return `${PREFIXES}
SELECT ?dmn ?identifier ?title ?apiEndpoint ?deploymentId
       ?inputId ?inputTitle ?inputType ?inputDescription ?inputValue
       ?outputId ?outputTitle ?outputType ?outputDescription ?outputValue
WHERE {
  ${filter}
  ?dmn a cprmv:DecisionModel ;
       dct:identifier ?identifier ;
       dct:title ?title ;
       cprmv:implementedBy ?apiEndpoint .
  OPTIONAL { ?dmn cprmv:deploymentId ?deploymentId }

  OPTIONAL {
    ?input a cpsv:Input ;
           cpsv:isRequiredBy ?dmn ;
           dct:identifier ?inputId ;
           dct:title ?inputTitle ;
           dct:type ?inputType .
    OPTIONAL { ?input dct:description ?inputDescription }
    OPTIONAL { ?input schema:value ?inputValue }
  }

  OPTIONAL {
    ?output a cpsv:Output ;
            cpsv:produces ?dmn ;
            dct:identifier ?outputId ;
            dct:title ?outputTitle ;
            dct:type ?outputType .
    OPTIONAL { ?output dct:description ?outputDescription }
    OPTIONAL { ?output schema:value ?outputValue }
  }
}
ORDER BY ?inputId ?outputId`;
}

function dmnChainLinksQuery(): string {
  return `${PREFIXES}
SELECT DISTINCT ?dmn1Identifier ?dmn1Title ?dmn2Identifier ?dmn2Title ?variableId ?variableType
WHERE {
  ?dmn1 a cprmv:DecisionModel ;
        dct:identifier ?dmn1Identifier ;
        dct:title ?dmn1Title .
  ?output1 a cpsv:Output ;
           cpsv:produces ?dmn1 ;
           dct:identifier ?variableId ;
           dct:type ?variableType .

  ?dmn2 a cprmv:DecisionModel ;
        dct:identifier ?dmn2Identifier ;
        dct:title ?dmn2Title .
  ?input2 a cpsv:Input ;
          cpsv:isRequiredBy ?dmn2 ;
          dct:identifier ?variableId ;
          dct:type ?variableType .

  FILTER(?dmn1 != ?dmn2)
  FILTER(LANG(?dmn1Title) = "nl" || LANG(?dmn1Title) = "")
  FILTER(LANG(?dmn2Title) = "nl" || LANG(?dmn2Title) = "")
}
ORDER BY ?dmn1Title ?dmn2Title ?variableId`;
}

function dmnEnhancedChainLinksQuery(): string {
  return `${PREFIXES}
SELECT DISTINCT ?dmn1Identifier ?dmn1Title ?dmn2Identifier ?dmn2Title
                ?outputVarId ?inputVarId ?variableType ?matchType ?sharedConcept
WHERE {
  ?outputVar a cpsv:Output ;
             cpsv:produces ?dmn1 ;
             dct:identifier ?outputVarId ;
             dct:type ?variableType .

  ?inputVar a cpsv:Input ;
            cpsv:isRequiredBy ?dmn2 ;
            dct:identifier ?inputVarId ;
            dct:type ?variableType .

  FILTER(?dmn1 != ?dmn2)

  ?dmn1 a cprmv:DecisionModel ;
        dct:identifier ?dmn1Identifier ;
        dct:title ?dmn1Title .
  ?dmn2 a cprmv:DecisionModel ;
        dct:identifier ?dmn2Identifier ;
        dct:title ?dmn2Title .

  OPTIONAL {
    ?outputConcept a skos:Concept ;
                   skos:exactMatch ?conceptUri ;
                   dct:subject ?outputVar .
    ?inputConcept a skos:Concept ;
                  skos:exactMatch ?conceptUri ;
                  dct:subject ?inputVar .
  }

  BIND(
    IF(?outputVarId = ?inputVarId && BOUND(?conceptUri), "both",
    IF(?outputVarId = ?inputVarId, "exact",
    IF(BOUND(?conceptUri), "semantic", "none")))
    AS ?matchType
  )
  BIND(IF(BOUND(?conceptUri), ?conceptUri, ?outputVarId) AS ?sharedConcept)

  FILTER(?matchType != "none")
  FILTER(LANG(?dmn1Title) = "nl" || LANG(?dmn1Title) = "")
  FILTER(LANG(?dmn2Title) = "nl" || LANG(?dmn2Title) = "")
}
ORDER BY ?matchType ?dmn1Title ?dmn2Title`;
}

function dmnSemanticEquivalencesQuery(): string {
  return `${PREFIXES}
SELECT ?concept1 ?concept1Label ?variable1Id ?variable1Type
       ?concept2 ?concept2Label ?variable2Id ?variable2Type
       ?sharedConcept ?dmn1Title ?dmn2Title
WHERE {
  ?concept1 a skos:Concept ;
            skos:exactMatch ?sharedConcept ;
            skos:prefLabel ?concept1Label ;
            dct:subject ?variable1 .
  ?variable1 dct:identifier ?variable1Id ;
             dct:type ?variable1Type .
  { ?variable1 a cpsv:Input ; cpsv:isRequiredBy ?dmn1 . }
  UNION
  { ?variable1 a cpsv:Output ; cpsv:produces ?dmn1 . }
  ?dmn1 a cprmv:DecisionModel ;
        dct:title ?dmn1Title .

  ?concept2 a skos:Concept ;
            skos:exactMatch ?sharedConcept ;
            skos:prefLabel ?concept2Label ;
            dct:subject ?variable2 .
  ?variable2 dct:identifier ?variable2Id ;
             dct:type ?variable2Type .
  { ?variable2 a cpsv:Input ; cpsv:isRequiredBy ?dmn2 . }
  UNION
  { ?variable2 a cpsv:Output ; cpsv:produces ?dmn2 . }
  ?dmn2 a cprmv:DecisionModel ;
        dct:title ?dmn2Title .

  FILTER(?concept1 != ?concept2)
  FILTER(?dmn1 != ?dmn2)
  FILTER(LANG(?dmn1Title) = "nl" || LANG(?dmn1Title) = "")
  FILTER(LANG(?dmn2Title) = "nl" || LANG(?dmn2Title) = "")
}
ORDER BY ?sharedConcept ?dmn1Title ?dmn2Title`;
}

function organizationListQuery(): string {
  return `${PREFIXES}
SELECT ?organization ?identifier ?name ?homepage ?logo
WHERE {
  ?organization a cv:PublicOrganisation ;
                dct:identifier ?identifier ;
                skos:prefLabel ?name .
  OPTIONAL { ?organization foaf:homepage ?homepage }
  OPTIONAL { ?organization foaf:logo ?logo }
  OPTIONAL { ?organization schema:image ?logo }
  FILTER(LANG(?name) = "nl" || LANG(?name) = "")
}
ORDER BY ?name`;
}

function serviceListQuery(): string {
  return `${PREFIXES}
SELECT ?service ?title ?description ?authorityName ?homepage
WHERE {
  ?service a cpsv:PublicService ;
           dct:title ?title .
  OPTIONAL { ?service dct:description ?description }
  OPTIONAL {
    ?service cv:hasCompetentAuthority ?authority .
    ?authority skos:prefLabel ?authorityName .
    OPTIONAL { ?authority foaf:homepage ?homepage }
  }
  FILTER(LANG(?title) = "nl" || LANG(?title) = "")
}
ORDER BY ?title`;
}

function ruleListQuery(serviceTitle?: string): string {
  const serviceFilter = serviceTitle
    ? `FILTER(CONTAINS(LCASE(STR(?serviceTitle)), LCASE("${serviceTitle}")))`
    : '';
  return `${PREFIXES}
SELECT DISTINCT ?serviceTitle ?ruleTitle ?validFrom ?confidence ?description
WHERE {
  ?service a cpsv:PublicService ;
           dct:title ?serviceTitle .
  ?rule a cpsv:Rule ;
        dct:title ?ruleTitle .

  # A rule links to its service either directly (older exports) or via the
  # shared legal resource. Since the CPSV-AP RuleShape fix, a cpsv:Rule's
  # cpsv:implements points at an eli:LegalResource — the same resource the
  # service declares with cv:hasLegalResource — instead of the service itself.
  {
    ?rule cpsv:implements ?service .
  } UNION {
    ?service cv:hasLegalResource ?legal .
    ?rule cpsv:implements ?legal .
  }

  OPTIONAL { ?rule dct:description ?description }
  OPTIONAL { ?rule cprmv041:validFrom ?validFrom }
  OPTIONAL { ?rule cprmv041:confidenceLevel ?confidence }
  FILTER(LANG(?serviceTitle) = "nl" || LANG(?serviceTitle) = "")
  FILTER(LANG(?ruleTitle) = "nl" || LANG(?ruleTitle) = "")
  # Hide auto-generated DMN decision rules (placeholder "Decision rule <id>" titles).
  FILTER(!STRSTARTS(STR(?ruleTitle), "Decision rule "))
  ${serviceFilter}
}
ORDER BY ?serviceTitle ?validFrom ?ruleTitle`;
}

function conceptListQuery(): string {
  return `${PREFIXES}
SELECT DISTINCT ?subject ?prefLabel ?exactMatch ?serviceTitle
WHERE {
  ?subject skos:exactMatch ?exactMatch ;
           dct:subject ?variable .
  OPTIONAL {
    ?subject skos:prefLabel ?prefLabel .
    FILTER(LANG(?prefLabel) = "nl" || LANG(?prefLabel) = "")
  }
  # Older exports give the variable an explicit edge to the DMN; newer exports
  # (CPRMV 0.4.1) emit a bare <dmnUri>/input|output/N variable URI with no edge,
  # so derive the DMN URI from the variable URI and fall back to it.
  OPTIONAL { ?variable cpsv:isRequiredBy ?dmnRequired . }
  OPTIONAL { ?variable cpsv:produces ?dmnProduced . }
  BIND(IRI(REPLACE(STR(?variable), "/(input|output)/[0-9]+$", "")) AS ?dmnFromUri)
  BIND(COALESCE(?dmnRequired, ?dmnProduced, ?dmnFromUri) AS ?dmn)
  { ?dmn cprmv:implements ?service } UNION { ?dmn cprmv041:implements ?service }
  OPTIONAL {
    ?service dct:title ?serviceTitle .
    FILTER(LANG(?serviceTitle) = "nl" || LANG(?serviceTitle) = "")
  }
}
ORDER BY ?service ?subject`;
}

function serviceRulesMetadataQuery(serviceId?: string): string {
  const serviceFilter = serviceId ? `FILTER(?serviceId = "${serviceId}")` : '';
  return `${PREFIXES}
SELECT ?serviceId ?serviceTitle ?legalResourceId ?rulesetId ?ruleIdPath
       ?ruleId ?ruleDefinition ?ruleSituatie ?ruleNorm
WHERE {
  ?rule a cprmv:Rule ;
        cprmv:implements ?implementedResource ;
        cprmv:rulesetId ?rulesetId ;
        cprmv:ruleIdPath ?ruleIdPath .

  {
    ?implementedResource a eli:LegalResource ;
                         dct:identifier ?legalResourceId .
    BIND(?implementedResource AS ?legalResource)
  }
  UNION
  {
    ?legalResource a eli:LegalResource ;
                   dct:identifier ?legalResourceId ;
                   eli:is_realized_by ?implementedResource .
  }

  ?service a cpsv:PublicService ;
           dct:identifier ?serviceId ;
           dct:title ?serviceTitle ;
           cv:hasLegalResource ?legalResource .

  OPTIONAL { ?rule cprmv:id ?ruleId }
  OPTIONAL { ?rule cprmv:definition ?ruleDefinition }
  OPTIONAL { ?rule cprmv:situatie ?ruleSituatie }
  OPTIONAL { ?rule cprmv:norm ?ruleNorm }

  FILTER(LANG(?serviceTitle) = "nl" || LANG(?serviceTitle) = "")
  ${serviceFilter}
}
ORDER BY ?serviceId ?ruleIdPath`;
}

// ── HTTP execution ─────────────────────────────────────────────────────────

async function executeSparql(query: string, endpoint?: string): Promise<string> {
  const target = endpoint ?? ENDPOINT;
  const headers: Record<string, string> = {
    Accept: 'application/sparql-results+json',
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (TOKEN) headers['Authorization'] = `Bearer ${TOKEN}`;

  const response = await fetch(target, {
    method: 'POST',
    headers,
    body: `query=${encodeURIComponent(query)}`,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }
  return response.text();
}

// ── Server ─────────────────────────────────────────────────────────────────

const server = new Server(
  { name: 'triplydb-mcp', version: '2.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  const endpoint = args['endpoint'] as string | undefined;

  try {
    let query: string;

    switch (name) {
      case 'dmn_list':
        query = dmnListQuery();
        break;

      case 'dmn_get': {
        const uri = args['uri'] as string | undefined;
        const identifier = args['identifier'] as string | undefined;
        if (!uri && !identifier) {
          return {
            content: [{ type: 'text', text: 'Error: provide either uri or identifier' }],
            isError: true,
          };
        }
        query = dmnGetQuery(uri, identifier);
        break;
      }

      case 'dmn_chain_links':
        query = dmnChainLinksQuery();
        break;

      case 'dmn_enhanced_chain_links':
        query = dmnEnhancedChainLinksQuery();
        break;

      case 'dmn_semantic_equivalences':
        query = dmnSemanticEquivalencesQuery();
        break;

      case 'organization_list':
        query = organizationListQuery();
        break;

      case 'service_list':
        query = serviceListQuery();
        break;

      case 'rule_list': {
        const serviceTitle = args['serviceTitle'] as string | undefined;
        query = ruleListQuery(serviceTitle);
        break;
      }

      case 'concept_list':
        query = conceptListQuery();
        break;

      case 'service_rules_metadata': {
        const serviceId = args['serviceId'] as string | undefined;
        query = serviceRulesMetadataQuery(serviceId);
        break;
      }

      case 'sparql_query': {
        const raw = args['query'] as string | undefined;
        if (!raw) {
          return { content: [{ type: 'text', text: 'Error: query is required' }], isError: true };
        }
        query = raw;
        break;
      }

      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    }

    const result = await executeSparql(query, endpoint);
    return { content: [{ type: 'text', text: result }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
void (async () => {
  await server.connect(transport);
})();
