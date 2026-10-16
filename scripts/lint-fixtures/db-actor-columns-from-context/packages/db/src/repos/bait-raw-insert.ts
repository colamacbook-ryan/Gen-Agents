export const add = (w: any, by: string) => w.run('INSERT INTO tasks (id, created_by) VALUES (?, ?)', ['x', by]);
