export const rename = async (k: any, id: string, name: string) => k.updateTable('roles').set({ name }).where('id', '=', id).execute();
