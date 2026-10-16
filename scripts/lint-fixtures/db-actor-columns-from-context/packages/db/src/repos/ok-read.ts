// đọc / lọc theo người ghi là hợp lệ
export const mine = (r: any, actor: string) => r.prepare('SELECT id, created_by FROM tasks WHERE created_by = ?').all(actor);
export const touched = (r: any) => r.prepare('UPDATE tasks SET title = ? WHERE updated_by = ?');
export const pick = (row: { id: string }) => row.id;
