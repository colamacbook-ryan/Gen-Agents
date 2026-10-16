export async function maybe() {
  if (process.env.GA_TESTKIT === '1') return import('@ga/testkit');
  return null;
}
