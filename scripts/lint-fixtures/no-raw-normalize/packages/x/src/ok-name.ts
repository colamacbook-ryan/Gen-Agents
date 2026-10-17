declare const normalizeCredentialName: (s: string) => string;
declare const o: { normalizeKey(s: string): string };
export const n = [normalizeCredentialName('a'), o.normalizeKey('b')];
