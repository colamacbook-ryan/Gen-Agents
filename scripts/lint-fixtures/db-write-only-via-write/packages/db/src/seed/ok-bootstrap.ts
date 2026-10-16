export function seed(conn: any, ws: string, actor: string) {
  conn.bootstrap({ workspaceId: ws, systemActorId: actor }, (w: any) => {
    w.run("INSERT INTO actors (id, workspace_id, kind, system_key, label) VALUES (?, ?, 'system', 'system', 'System')", [actor, ws]);
  });
  conn.maintenance('purge', (w: any) => w.run('DELETE FROM jobs WHERE id = ?', ['x']));
}
