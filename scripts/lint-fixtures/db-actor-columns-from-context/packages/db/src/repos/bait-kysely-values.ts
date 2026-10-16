export const add = (w: any, k: any, by: string) => w.run(k.insertInto('positions').values({ id: 'x', created_by: by }));
