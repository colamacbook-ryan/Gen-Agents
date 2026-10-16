// (a+)+ trong chú thích không tính
export const bounded = /(?=[a-z]{0,8}\d)[a-z0-9]{8}/;
export const quoted = /^'(?:[^']|'')*'$/;
export const run = /[0-9A-Za-z_-]{32,}/g;
export const pem = /-----BEGIN [A-Z ]{0,40}PRIVATE KEY-----/;
export const header = /^-- ([a-z_]+): (.+)$/;
export const f = (a: number, b: number, c: number) => ((a + b) * c) / 2;
