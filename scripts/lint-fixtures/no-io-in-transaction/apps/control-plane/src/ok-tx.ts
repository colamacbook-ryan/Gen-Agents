export async function f(db: any, url: string) {
  db.transaction(() => {
    db.exec('UPDATE a SET b = 1');
  })();
  await fetch(url);
}
