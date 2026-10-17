// @ga/db/fake — fake DataStore trong RAM cho test M2 (không ép guard DB; xem giới hạn ở store.ts).
export { baselineSchema, MemDb, type MemRow, MemTable } from './mem.ts';
export { createFakeStore, type FakeStore, type FakeViews } from './store.ts';
