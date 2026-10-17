import { main } from './cli.ts';

// Điểm vào thật của `ga-runner` (shim /usr/local/bin/ga-runner trong image runtime gọi tệp này).
// Pipe stdout / stderr trên Linux là đồng bộ ⇒ process.exit không cắt cụt output đã ghi.
process.exit(await main(process.argv.slice(2)));
