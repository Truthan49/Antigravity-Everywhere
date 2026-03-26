import { refreshOwnerMap, grpc } from './src/lib/bridge/gateway';

async function main() {
  await refreshOwnerMap();
  const owners = (await import('./src/lib/bridge/gateway')).convOwnerMap;
  const cascadeId = '3d015661-1cdf-4b71-b802-42caa6c1fb9e';
  const conn = owners.get(cascadeId);
  if (!conn) return;
  const resp = await grpc.getCascadeTrajectory(conn.port, conn.csrf, cascadeId);
  for (const s of (resp.trajectory?.steps||[])) {
    if (s.type === 'CORTEX_STEP_TYPE_USER_INPUT') {
      console.log(JSON.stringify(s.userInput, null, 2));
    }
  }
}
main();
