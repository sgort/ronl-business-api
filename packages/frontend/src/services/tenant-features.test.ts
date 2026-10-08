import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import type { TenantConfig } from './tenant';

// A "features" flag only shows a card on the citizen dashboard; the card then
// starts one fixed process (Dashboard.tsx). Vergunningen is Flevoland's
// Kapvergunning (AwbShellProcess) and Subsidies Flevoland's Thuisbatterij
// (ThuisbatterijSubsidieAanvraagProcess), both deployed under flevoland only.
// A citizen of another tenant can start them, but resolveStartTenant then
// hands the case to Flevoland: the wrong authority for a municipality's
// resident. Zorgtoeslag is different on purpose: a national allowance that
// Dienst Toeslagen handles for a citizen of any channel.
const tenants: TenantConfig[] = Object.values(
  JSON.parse(readFileSync(join(__dirname, '../../public/tenants.json'), 'utf8')).tenants
);

describe('tenants.json citizen services', () => {
  it.each(
    tenants.filter((t) => t.organisationType === 'municipality').map((t) => [t.id, t] as const)
  )('%s does not offer Flevoland’s Kapvergunning or Thuisbatterij', (_id, tenant) => {
    expect(tenant.features.vergunningen).toBe(false);
    expect(tenant.features.subsidies).toBe(false);
  });

  it.each(
    tenants.filter((t) => t.organisationType === 'municipality').map((t) => [t.id, t] as const)
  )('%s offers Zorgtoeslag, Meldingen and the consent tab', (_id, tenant) => {
    expect(tenant.features).toMatchObject({ zorgtoeslag: true, meldingen: true, dvtp: true });
  });

  it('leaves Flevoland its own services', () => {
    const flevoland = tenants.find((t) => t.id === 'flevoland');

    expect(flevoland?.features).toMatchObject({ vergunningen: true, subsidies: true });
  });

  // HeusdenpasAanvraagProcess is deployed under heusden only. Another tenant's
  // citizen would be handed to Gemeente Heusden by resolveStartTenant.
  it('offers the Heusdenpas to Heusden and nobody else', () => {
    expect(tenants.filter((t) => t.features.heusdenpas).map((t) => t.id)).toEqual(['heusden']);
  });
});
