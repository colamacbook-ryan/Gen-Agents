// INSERT INTO trong chú thích không tính
export const list = (db: any) => db.prepare('SELECT id FROM roles WHERE name = ?').all('x');
export const msg = 'Không UPDATE được vì Role đang Trọng thương';
