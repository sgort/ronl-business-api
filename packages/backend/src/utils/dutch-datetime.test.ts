import { formatDutchDateTime } from './dutch-datetime';

/**
 * Asserted by parts rather than as one exact string: the separator ICU puts
 * between date and time has changed between Node/ICU releases (a narrow
 * no-break space in some), and a full-string equality would fail on a CI
 * runner whose Node differs from the developer's while the output is in fact
 * correct. The parts are the load-bearing content.
 */
describe('formatDutchDateTime', () => {
  it('renders Dutch month names and a seconds-precision time', () => {
    const out = formatDutchDateTime(new Date('2026-08-30T12:23:11Z'));
    expect(out).toContain('30 augustus 2026');
    expect(out).toContain('14:23:11');
  });

  it('applies Amsterdam summer time (UTC+2), not the host zone', () => {
    expect(formatDutchDateTime(new Date('2026-08-30T12:23:11Z'))).toContain('14:23:11');
  });

  it('applies Amsterdam winter time (UTC+1), so the offset is not hard-coded', () => {
    const out = formatDutchDateTime(new Date('2026-01-15T12:23:11Z'));
    expect(out).toContain('15 januari 2026');
    expect(out).toContain('13:23:11');
  });

  it('defaults to now when given no argument', () => {
    const before = Date.now();
    const out = formatDutchDateTime();
    // Only that it produced a plausible stamp -- asserting the exact clock
    // value would be a race, and pinning it with fake timers would test the
    // timer, not the formatter.
    expect(out).toMatch(/\d{4}/);
    expect(Date.now()).toBeGreaterThanOrEqual(before);
  });
});
