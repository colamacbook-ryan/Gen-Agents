// cấm INSERT OR REPLACE — dùng ON CONFLICT DO UPDATE
export const q = 'INSERT INTO id_counters (a) VALUES (1) ON CONFLICT (a) DO UPDATE SET a = 2';
export const s = 'a'.replace('a', 'b');
