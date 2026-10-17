export const rename = (w: any, k: any, actor: string) => w.run(k.updateTable('roles').set({ name: 'n', 'updated_by': actor }));
