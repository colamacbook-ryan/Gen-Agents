export const seed = (conn: any, t: any) => conn.bootstrap(t, () => conn.maintenance ? 1 : 0);
export const purge = (conn: any) => conn.maintenance('purge', () => 1);
