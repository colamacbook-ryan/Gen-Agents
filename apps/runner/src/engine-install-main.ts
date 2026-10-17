import { engineInstallMain } from './engine-install/cli.ts';

// Điểm vào thật của `ga-engine-install` (shim /usr/local/bin/ga-engine-install trong image runtime gọi tệp này).
process.exit(await engineInstallMain(process.argv.slice(2)));
