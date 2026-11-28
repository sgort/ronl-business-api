// Tests for cooldown-proof.mjs. Self-contained, like the other scripts/*.test.mjs:
// no test runner, no network, prints a PASS count, exits 1 on any failure.
import {
  failureDetail,
  fetchPackument,
  isCooldownRefusal,
  parseMinReleaseAge,
  pickYoungVersion,
  splitCommand,
  verdict,
} from './cooldown-proof.mjs';

let passed = 0;
const failures = [];
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed += 1;
  else failures.push(`${label}\n    expected ${e}\n    actual   ${a}`);
}

const NOW = Date.parse('2026-11-27T12:00:00Z');
const daysAgo = (d) => new Date(NOW - d * 86_400_000).toISOString();

const packument = {
  'dist-tags': { latest: '3.0.0' },
  time: {
    created: daysAgo(900),
    modified: daysAgo(1),
    '1.0.0': daysAgo(100),
    '2.0.0': daysAgo(20),
    '2.1.0': daysAgo(10),
    '2.2.0': daysAgo(3),
    '3.0.0-beta.1': daysAgo(1),
  },
};

check('pick: newest stable under 14 days', pickYoungVersion(packument, NOW, 14), '2.2.0');
check(
  'pick: ignores prereleases',
  pickYoungVersion(
    { time: { '1.0.0': daysAgo(50), '2.0.0-rc.1': daysAgo(1), '2.0.0-beta.2': daysAgo(2) } },
    NOW,
    14
  ),
  null
);
check(
  'pick: none young -> null',
  pickYoungVersion({ time: { created: daysAgo(5), '1.0.0': daysAgo(40) } }, NOW, 14),
  null
);
check('pick: missing time -> null', pickYoungVersion({}, NOW, 14), null);
check(
  'pick: newest by publish date, not by semver',
  pickYoungVersion({ time: { '1.9.9': daysAgo(2), '2.0.0': daysAgo(8) } }, NOW, 14),
  '1.9.9'
);

check(
  'verdict: refused + control ok -> refused',
  verdict({ refused: true, controlOk: true }),
  'refused'
);
check(
  'verdict: not refused -> not refused',
  verdict({ refused: false, controlOk: true }),
  'not refused'
);
check(
  'verdict: control fails -> could not run',
  verdict({ refused: true, controlOk: false }),
  'could not run'
);
check(
  'verdict: control fails, not refused -> could not run',
  verdict({ refused: false, controlOk: false }),
  'could not run'
);

check(
  'refusal text recognised: with a date before',
  isCooldownRefusal(
    'npm error notarget No matching version found for vite@7.9.0 with a date before 11/13/2026.'
  ),
  true
);
check(
  'refusal text recognised: ETARGET',
  isCooldownRefusal(
    'npm error code ETARGET\nnpm error notarget No matching version found for x@1.0.0.'
  ),
  true
);
check(
  'refusal text: ENOTFOUND is not a refusal',
  isCooldownRefusal('npm error code ENOTFOUND\nnpm error network request failed'),
  false
);
check('refusal text: empty', isCooldownRefusal(''), false);

check('splitCommand: default', splitCommand('npm'), ['npm']);
check('splitCommand: whitespace split', splitCommand('npx -y  -p npm@12.2.2 npm'), [
  'npx',
  '-y',
  '-p',
  'npm@12.2.2',
  'npm',
]);
check('parseMinReleaseAge: value', parseMinReleaseAge('# c\nmin-release-age=14\n'), 14);
check('parseMinReleaseAge: absent', parseMinReleaseAge('# min-release-age=14\nfoo=1\n'), null);
check('parseMinReleaseAge: junk', parseMinReleaseAge('min-release-age=abc\n'), null);

// Hardening (Task 1 review): an unpublished version stays in `time` but leaves
// `versions`; picking it would make `npm install` fail and the proof exit 2.
check(
  'pick: skips a version in time but absent from versions (unpublished)',
  pickYoungVersion(
    {
      time: { '1.0.0': daysAgo(50), '2.0.0': daysAgo(1), '2.0.1': daysAgo(4) },
      versions: { '1.0.0': {}, '2.0.1': {} },
    },
    NOW,
    14
  ),
  '2.0.1'
);
check(
  'pick: only unpublished young versions -> null',
  pickYoungVersion(
    { time: { '1.0.0': daysAgo(50), '2.0.0': daysAgo(1) }, versions: { '1.0.0': {} } },
    NOW,
    14
  ),
  null
);

// Hardening: the registry fetch carries a timeout signal, and a timeout rejects.
let seenSignal = null;
await fetchPackument('vite', async (url, opts) => {
  seenSignal = opts?.signal;
  return { ok: true, json: async () => ({}) };
});
check('fetchPackument: passes an AbortSignal', seenSignal instanceof AbortSignal, true);
let timedOut = false;
try {
  await fetchPackument('vite', async () => {
    throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
  });
} catch (err) {
  timedOut = err.name === 'TimeoutError';
}
check('fetchPackument: a timeout rejects (main maps it to exit 2)', timedOut, true);

// Hardening: a spawnSync error or timeout surfaces its message, not just stderr.
check(
  'failureDetail: includes error.message',
  failureDetail({ error: new Error('spawnSync npm ETIMEDOUT'), stderr: '' }).includes('ETIMEDOUT'),
  true
);
check(
  'failureDetail: error and stderr together',
  failureDetail({ error: new Error('boom'), stderr: 'npm error x' }),
  'boom\nnpm error x'
);
check('failureDetail: stderr only', failureDetail({ stderr: 'npm error x' }), 'npm error x');

if (failures.length > 0) {
  console.error(`FAIL: ${failures.length} failed, ${passed} passed`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`PASS: ${passed} checks`);
