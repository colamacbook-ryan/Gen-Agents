import { spawnSync } from 'node:child_process';
export const f = (conn: any) => conn.withMaintenance('dọn', () => { spawnSync('git', ['gc']); });
