export const purge = (db: any) => db.exec('DELETE FROM jobs WHERE status = 1');
export const touch = (db: any) => db.exec('UPDATE roles SET name = 1');
