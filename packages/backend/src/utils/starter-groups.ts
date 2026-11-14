import { XMLParser } from 'fast-xml-parser';

/**
 * Who may start a process, as its BPMN model declares it.
 *
 * `camunda:candidateStarterGroups` on the process element names the groups
 * (Keycloak realm roles, here) whose members may start it. The LDE Modeler
 * edits it under Candidate starter. A process that declares none is open to
 * whoever the tenant rule already lets start it, which keeps every process
 * modelled before this attribute was read working as it did.
 */

type XmlNode = Record<string, unknown>;

// As in rip-swimlane/bpmn-swimlane.ts: strip namespace prefixes so lookups do
// not depend on which alias the modeller declared (camunda: or operaton:).
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  isArray: (name) => name === 'process' || name === 'startEvent',
});

/**
 * The process element with this key. Operaton hands back the whole deployed file
 * for a definition, and a collaboration file holds one process per pool, so the
 * first process is not necessarily the one asked about.
 */
function processOf(bpmnXml: string, processKey: string): XmlNode | undefined {
  const doc = parser.parse(bpmnXml) as XmlNode;
  const definitions = doc.definitions as XmlNode | undefined;
  const processes = (definitions?.process as XmlNode[] | undefined) ?? [];
  return processes.find((p) => p['@_id'] === processKey);
}

/** The declared candidate starter groups, or null when the process declares none. */
export function parseStarterGroups(bpmnXml: string, processKey: string): string[] | null {
  const raw = processOf(bpmnXml, processKey)?.['@_candidateStarterGroups'];
  if (typeof raw !== 'string') return null;
  const groups = raw
    .split(',')
    .map((g) => g.trim())
    .filter((g) => g !== '');
  return groups.length > 0 ? groups : null;
}

/**
 * Whether the process has a start form: a form on one of its own start events,
 * attached by formRef or by formKey. A start event inside a subprocess starts
 * that subprocess, not the process, so its form does not count.
 *
 * Any non-empty formKey counts, an embedded HTML form included: the start form
 * viewer then explains that it cannot show it, rather than the process being
 * started blind with no variables.
 */
export function hasStartForm(bpmnXml: string, processKey: string): boolean {
  const starts = (processOf(bpmnXml, processKey)?.startEvent as XmlNode[] | undefined) ?? [];
  const named = (v: unknown) => typeof v === 'string' && v.trim() !== '';
  return starts.some((s) => named(s['@_formRef']) || named(s['@_formKey']));
}

/** Whether a user with these roles may start a process declaring these groups. */
export function mayStart(roles: readonly string[], starterGroups: string[] | null): boolean {
  if (starterGroups === null) return true;
  return starterGroups.some((group) => roles.includes(group));
}
