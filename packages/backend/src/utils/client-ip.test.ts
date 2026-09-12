import { normalizeClientIp, rateLimitKey } from './client-ip';

describe('normalizeClientIp', () => {
  it('strips the port Azure appends to X-Forwarded-For', () => {
    // The exact shape observed on ACC, which is what made the limiter bucket
    // per connection instead of per client.
    expect(normalizeClientIp('77.161.155.118:52169')).toBe('77.161.155.118');
  });

  it('gives the same answer for every port the same client uses', () => {
    const ports = ['52169', '52170', '61004', '9'];
    const keys = new Set(ports.map((p) => normalizeClientIp(`77.161.155.118:${p}`)));
    expect(keys.size).toBe(1);
    expect([...keys]).toEqual(['77.161.155.118']);
  });

  it('leaves a bare IPv4 address alone', () => {
    expect(normalizeClientIp('77.161.155.118')).toBe('77.161.155.118');
  });

  it.each([
    ['2001:db8::1', '2001:db8::1'],
    ['::1', '::1'],
    // The socket-peer form Express reports with trust proxy off. It has three
    // colons, so a naive "cut at the first colon" would reduce it to the empty
    // string and put every local caller in one bucket named ''.
    ['::ffff:10.0.0.5', '::ffff:10.0.0.5'],
    ['fe80::1ff:fe23:4567:890a', 'fe80::1ff:fe23:4567:890a'],
  ])('leaves the bare IPv6 address %s intact', (input, expected) => {
    expect(normalizeClientIp(input)).toBe(expected);
  });

  it.each([
    ['[2001:db8::1]:52169', '2001:db8::1'],
    ['[::1]:8080', '::1'],
    ['[2001:db8::1]', '2001:db8::1'],
  ])('unwraps bracketed IPv6 %s', (input, expected) => {
    expect(normalizeClientIp(input)).toBe(expected);
  });

  it.each([
    ['[2001:db8::1', '[2001:db8::1'],
    ['[]:80', '[]:80'],
  ])('hands back a malformed bracketed address %s unchanged', (input, expected) => {
    // Not a crash and not a shared bucket: a value we cannot parse becomes its
    // own key, so one malformed caller is limited on its own rather than either
    // taking the process down or joining everyone else's budget.
    expect(normalizeClientIp(input)).toBe(expected);
  });

  it.each([undefined, '', '   '])('falls back to a fixed key for %p', (input) => {
    // Deliberately one shared bucket rather than a per-request unique value:
    // a caller whose address cannot be determined must not get an unlimited
    // budget by virtue of being unidentifiable.
    expect(normalizeClientIp(input)).toBe('unknown');
  });
});

describe('rateLimitKey', () => {
  it('scopes by tenant when one is given', () => {
    expect(rateLimitKey('77.161.155.118:52169', 'flevoland')).toBe('flevoland:77.161.155.118');
  });

  it('keys on the address alone without a tenant', () => {
    expect(rateLimitKey('77.161.155.118:52169')).toBe('77.161.155.118');
  });

  it('keeps two tenants from the same address in separate buckets', () => {
    const a = rateLimitKey('10.0.0.1', 'flevoland');
    const b = rateLimitKey('10.0.0.1', 'utrecht');
    expect(a).not.toBe(b);
  });

  it('puts one client behind one bucket across connections, tenant or not', () => {
    const withTenant = ['52169', '52170'].map((p) =>
      rateLimitKey(`77.161.155.118:${p}`, 'flevoland')
    );
    const without = ['52169', '52170'].map((p) => rateLimitKey(`77.161.155.118:${p}`));
    expect(new Set(withTenant).size).toBe(1);
    expect(new Set(without).size).toBe(1);
  });
});
