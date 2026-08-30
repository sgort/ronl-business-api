/**
 * Formats a moment as Dutch date + time for documents a signer reads.
 *
 * Pinned to Europe/Amsterdam rather than the host's zone: ACC and production
 * run in Azure, whose containers are UTC, so an unpinned format would stamp a
 * signature an hour or two before the signer actually made it -- on a document
 * that is archived into eDOCS as the province's record of the approval.
 * Pinning also makes the output identical on a developer's laptop and on the
 * server, so what is tested is what is archived.
 *
 * Seconds are included deliberately: two approvals in the same minute are
 * ordinary on a board where one person works several tasks in a row, and a
 * minute-precision stamp cannot tell them apart.
 */
export function formatDutchDateTime(when: Date = new Date()): string {
  return new Intl.DateTimeFormat('nl-NL', {
    dateStyle: 'long',
    timeStyle: 'medium',
    timeZone: 'Europe/Amsterdam',
  }).format(when);
}
