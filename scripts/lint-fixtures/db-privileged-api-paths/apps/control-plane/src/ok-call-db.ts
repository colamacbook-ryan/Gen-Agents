// gọi hàm đã xuất của @ga/db, không gọi conn.maintenance() trực tiếp
export const run = (purgeExpired: (c: unknown) => void, conn: unknown) => purgeExpired(conn);
