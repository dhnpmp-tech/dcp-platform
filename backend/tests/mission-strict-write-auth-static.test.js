const assert = require('assert');
const fs = require('fs');
const path = require('path');

const missionRoute = fs.readFileSync(path.join(__dirname, '..', 'src/routes/mission.js'), 'utf8');

const mutatingRoutes = [
  "router.post('/tasks', requireWriteAuth",
  "router.patch('/tasks/:id', requireWriteAuth",
  "router.post('/tasks/:id/reassign', requireWriteAuth",
  "router.delete('/tasks/:id', requireWriteAuth",
  "router.post('/tasks/:id/comments', requireWriteAuth",
  "router.post('/milestones', requireWriteAuth",
  "router.patch('/milestones/:id', requireWriteAuth",
  "router.post('/goals', requireWriteAuth",
  "router.patch('/goals/:id', requireWriteAuth",
];

assert(missionRoute.includes('function requireWriteAuth'), 'mission route should define a dedicated write auth guard');
assert(missionRoute.includes('strictMissionWritesEnabled'), 'write guard should read the strict mission write flag');
assert(missionRoute.includes('DCP_MISSION_STRICT_WRITE_AUTH'), 'write guard should be controlled by DCP_MISSION_STRICT_WRITE_AUTH');
assert(missionRoute.includes('mission_write_forbidden'), 'strict write failures should have a stable error code');
assert(missionRoute.includes('isAdminRequest(req) || isMissionAgentRequest(req)'), 'strict writes should allow admin token or mission agent key');
assert(missionRoute.includes('timingSafeEqualString'), 'mission agent key comparison should be timing-safe');

for (const route of mutatingRoutes) {
  assert(missionRoute.includes(route), `${route} should use requireWriteAuth`);
}

assert(
  missionRoute.includes("router.post('/pr-state', requireAuth"),
  'mission PR-state proxy should stay read-only and not require the mutation guard'
);
assert(
  !missionRoute.includes("router.post('/tasks', requireAuth")
    && !missionRoute.includes("router.patch('/tasks/:id', requireAuth")
    && !missionRoute.includes("router.post('/tasks/:id/reassign', requireAuth")
    && !missionRoute.includes("router.delete('/tasks/:id', requireAuth")
    && !missionRoute.includes("router.post('/tasks/:id/comments', requireAuth")
    && !missionRoute.includes("router.post('/milestones', requireAuth")
    && !missionRoute.includes("router.patch('/milestones/:id', requireAuth")
    && !missionRoute.includes("router.post('/goals', requireAuth")
    && !missionRoute.includes("router.patch('/goals/:id', requireAuth"),
  'mission task/milestone/goal mutations should not use broad requireAuth directly'
);

console.log('mission strict write auth static checks passed');
