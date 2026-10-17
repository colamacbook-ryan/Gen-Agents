export function assign(conn: any, k: any, actorId: string, id: string, name: string) {
  return conn.write(actorId, (w: any) => {
    w.run('INSERT INTO tasks (id) VALUES (?)', [id]);
    w.run(k.updateTable('roles').set({ name }).where('id', '=', id));
    w.run('DELETE FROM jobs WHERE id = ?', [id]);
  });
}
