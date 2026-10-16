export const raw = (db: any) => db.prepare('INSERT INTO positions (id, created_by) VALUES (?, ?)').run('x', 'y');
