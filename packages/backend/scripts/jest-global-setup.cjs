// packages/backend/scripts/jest-global-setup.cjs
//
// Both backend deploy workflows run `npm test` before `npm run build`, so
// without this the tests would read an openapi/openapi.json that does not
// exist yet -- or, locally, a stale one left by an earlier build.
const { buildOpenApi } = require('./build-openapi.cjs');

module.exports = async () => {
  buildOpenApi();
};
