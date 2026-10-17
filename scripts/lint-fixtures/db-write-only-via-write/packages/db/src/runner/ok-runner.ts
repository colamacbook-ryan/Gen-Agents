export const record = (db: any) => db.prepare('INSERT INTO schema_migrations (version) VALUES (1)').run();
