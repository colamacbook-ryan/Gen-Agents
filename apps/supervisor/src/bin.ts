import { startSupervisor } from './main.ts';

// `node apps/supervisor/src/bin.ts` — tiến trình ga-supervisor.
startSupervisor(process.env);
