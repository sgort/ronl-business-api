// packages/backend/scripts/jest-global-setup.cjs
//
// Both backend deploy workflows run `npm test` before `npm run build`, so
// without this the tests would read an openapi/openapi.json that does not
// exist yet -- or, locally, a stale one left by an earlier build.
const fs = require('fs');
const path = require('path');

const { buildOpenApi } = require('./build-openapi.cjs');

module.exports = async () => {
  buildOpenApi();

  // Where expectToMatchOperation records the operations it is asked about, for
  // scripts/check-conformance-coverage.cjs to read once the run is over (#269).
  // A fixed path, not a pid-derived one, because that script is a SEPARATE
  // process -- see its header for why it is not a globalTeardown. Truncated
  // here so a previous run cannot make this one look complete.
  process.env.CONFORMANCE_LOG = path.join(__dirname, '..', 'conformance-operations.log');
  fs.writeFileSync(process.env.CONFORMANCE_LOG, '');
};
