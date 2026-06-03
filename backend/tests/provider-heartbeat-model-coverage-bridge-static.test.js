const assert = require('assert');
const fs = require('fs');
const path = require('path');

const providersRoute = fs.readFileSync(path.join(__dirname, '..', 'src/routes/providers.js'), 'utf8');

assert(providersRoute.includes('legacyModelCoverage'), 'heartbeat should derive bounded legacy model coverage');
assert(providersRoute.includes('normalizeHeartbeatModelList'), 'heartbeat should normalize cached_models and vllm_models before persistence');
assert(providersRoute.includes('...normalizedCachedModels'), 'legacy coverage should include cached_models from legacy daemons');
assert(providersRoute.includes('...normalizedVllmModels'), 'legacy coverage should include vllm_models from legacy daemons');
assert(providersRoute.includes('!(Array.isArray(engines) && engines.length > 0)'), 'legacy bridge should not run when an engines payload is present');
assert(providersRoute.includes('SELECT COUNT(*) AS n FROM provider_engines WHERE provider_id = ?'), 'legacy bridge should check existing engine rows before writing providers.cached_models');
assert(providersRoute.includes('Number(engineRows?.n || 0) === 0'), 'legacy bridge should only write when no provider_engines rows own model coverage');
assert(providersRoute.includes('vllm_models = COALESCE(?, vllm_models)'), 'legacy bridge should preserve vllm_models unless the heartbeat supplied vllm_models');
assert(providersRoute.includes('legacy model coverage bridge skipped'), 'legacy bridge failures should be warn-only and never fail heartbeat');

console.log('provider heartbeat model coverage bridge static checks passed');
