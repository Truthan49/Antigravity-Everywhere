import { refreshOwnerMap } from './src/lib/bridge/gateway';
import { getCascadeTrajectory } from './src/lib/bridge/grpc';

async function main() {
  await refreshOwnerMap();
  const owners = (await import('./src/lib/bridge/gateway')).convOwnerMap;
  const cascadeId = '3d015661-1cdf-4b71-b802-42caa6c1fb9e';
  const conn = owners.get(cascadeId);
  if (!conn) return;
  const resp = await getCascadeTrajectory(conn.port, conn.csrf, cascadeId);
  for (const s of (resp?.trajectory?.steps || [])) {
    console.log(`STEP: ${s.type}`);
    if (s.userInput) {
      console.log('  userInput keys:', Object.keys(s.userInput));
      console.log('  userInput:', JSON.stringify(s.userInput).slice(0, 100));
    }
  }
}
main();
