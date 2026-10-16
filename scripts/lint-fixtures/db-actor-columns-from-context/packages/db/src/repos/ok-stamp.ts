import { stampInsert, stampUpdate } from '@ga/db';
export const add = (w: any, k: any) => w.run(k.insertInto('positions').values(stampInsert(w, { id: 'x', title: 't' })));
export const rename = (w: any, k: any) => w.run(k.updateTable('roles').set(stampUpdate(w, { name: 'n' })));
