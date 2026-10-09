import {
  CITIZEN_SERVICE_PROCESS_KEYS,
  citizenServicesAvailable,
  isCrossTenantProcess,
  type ProcessDeployment,
} from './citizen-services';

const d = (key: string, tenantId: string | null): ProcessDeployment => ({ key, tenantId });

describe('citizenServicesAvailable', () => {
  it('offers an own-tenant service deployed under the citizen tenant', () => {
    expect(
      citizenServicesAvailable([d('HeusdenpasAanvraagProcess', 'heusden')], 'heusden')
    ).toEqual(['heusdenpas']);
  });

  it('does not offer an own-tenant service deployed only under another tenant', () => {
    expect(citizenServicesAvailable([d('AwbShellProcess', 'flevoland')], 'amsterdam')).toEqual([]);
  });

  it('offers a cross-tenant service deployed under exactly one tenant to everyone', () => {
    expect(
      citizenServicesAvailable([d('AwbZorgtoeslagProcess', 'toeslagen')], 'amsterdam')
    ).toEqual(['zorgtoeslag']);
  });

  it('never counts an untenanted deployment', () => {
    const deployments = [
      d('ThuisbatterijSubsidieAanvraagProcess', null),
      d('AwbZorgtoeslagProcess', null),
    ];
    expect(citizenServicesAvailable(deployments, 'amsterdam')).toEqual([]);
  });

  it('offers an own-tenant service deployed under several tenants to a citizen of one of them', () => {
    const deployments = [d('AwbShellProcess', 'flevoland'), d('AwbShellProcess', 'utrecht')];
    expect(citizenServicesAvailable(deployments, 'utrecht')).toEqual(['vergunningen']);
  });

  it('does not offer a cross-tenant service deployed under several tenants (the start would be ambiguous)', () => {
    const deployments = [
      d('AwbZorgtoeslagProcess', 'toeslagen'),
      d('AwbZorgtoeslagProcess', 'uwv'),
    ];
    expect(citizenServicesAvailable(deployments, 'amsterdam')).toEqual([]);
  });

  it('gives a citizen without a tenant only cross-tenant services', () => {
    const deployments = [
      d('AwbZorgtoeslagProcess', 'toeslagen'),
      d('AwbShellProcess', 'flevoland'),
    ];
    expect(citizenServicesAvailable(deployments, '')).toEqual(['zorgtoeslag']);
    expect(citizenServicesAvailable(deployments, undefined)).toEqual(['zorgtoeslag']);
  });

  it('answers in registry order, ignoring keys the registry does not know', () => {
    const deployments = [
      d('HeusdenpasAanvraagProcess', 'heusden'),
      d('SomethingElse', 'heusden'),
      d('AwbZorgtoeslagProcess', 'toeslagen'),
    ];
    expect(citizenServicesAvailable(deployments, 'heusden')).toEqual(['zorgtoeslag', 'heusdenpas']);
  });
});

describe('isCrossTenantProcess', () => {
  it('is true only for a registry process marked cross-tenant', () => {
    expect(isCrossTenantProcess('AwbZorgtoeslagProcess')).toBe(true);
    expect(isCrossTenantProcess('AwbShellProcess')).toBe(false);
    expect(isCrossTenantProcess('HrOnboardingProcess')).toBe(false);
  });
});

describe('CITIZEN_SERVICE_PROCESS_KEYS', () => {
  it('lists every registry process once', () => {
    expect(CITIZEN_SERVICE_PROCESS_KEYS).toEqual([
      'AwbZorgtoeslagProcess',
      'AwbShellProcess',
      'ThuisbatterijSubsidieAanvraagProcess',
      'HeusdenpasAanvraagProcess',
    ]);
  });
});
