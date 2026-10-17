export const addTask = (db: any, id: string) => db.prepare('INSERT INTO tasks (id) VALUES (?)').run(id);
