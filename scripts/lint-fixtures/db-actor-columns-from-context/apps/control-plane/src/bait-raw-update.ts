export const del = (w: any, by: string) => w.run('UPDATE tasks SET deleted_at = app_now(), deleted_by = ? WHERE id = ?', [by, 'x']);
