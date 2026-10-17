export const q = (k: any) => k.insertInto('roles').orReplace().values({ id: 'x' });
