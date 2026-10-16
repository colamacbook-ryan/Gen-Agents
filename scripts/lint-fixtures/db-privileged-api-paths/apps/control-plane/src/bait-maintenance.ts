export const purge = (conn: any) => conn.maintenance('purge', (w: any) => w.run('DELETE FROM jobs'));
