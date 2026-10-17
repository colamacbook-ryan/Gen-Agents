export async function f(res: any, render: () => Promise<string>) {
  res.write(await render());
}
