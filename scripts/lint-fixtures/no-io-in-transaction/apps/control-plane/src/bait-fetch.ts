export const f = (db: any, url: string) =>
  db.transaction(() => {
    fetch(url);
    db.prepare('UPDATE a SET b = 1').run();
  })();
