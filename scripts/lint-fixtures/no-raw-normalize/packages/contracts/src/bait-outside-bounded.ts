export function boundedNfkc(s: string) {
  return s.slice(0, 10);
}
export const k = (s: string) => s.normalize('NFKC');
