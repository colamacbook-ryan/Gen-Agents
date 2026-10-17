export const f = (conn: any, actor: string, url: string) =>
  conn.write(actor, (w: any) => {
    fetch(url);
    w.run('UPDATE a SET b = 1');
  });
