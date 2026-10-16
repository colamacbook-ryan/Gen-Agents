export const f = (db: any, send: () => Promise<void>) => db.transaction(async () => { await send(); });
