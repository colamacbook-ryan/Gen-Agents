export function boundedNfkc(s: string, max = 10): string | null {
  const part = s.slice(0, 5).normalize('NFKC');
  return part.length > max ? null : part;
}
