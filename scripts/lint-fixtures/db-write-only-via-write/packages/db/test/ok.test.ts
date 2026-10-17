export const raw = (db: any) => db.prepare('INSERT INTO positions (id) VALUES (1)').run();
