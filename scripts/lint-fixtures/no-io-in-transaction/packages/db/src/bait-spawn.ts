import { spawnSync } from 'node:child_process';
export const f = (conn: any) => conn.maintenance('dọn', () => { spawnSync('git', ['gc']); });
