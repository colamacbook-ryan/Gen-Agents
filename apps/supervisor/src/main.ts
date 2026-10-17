import { systemClock } from '@ga/contracts';
import { loadConfig } from './config.ts';
import { DockerRuntime, dockerFromHost } from './docker.ts';
import { stderrLogger } from './log.ts';
import { PtyRelay } from './pty.ts';
import { Broker } from './runtime.ts';
import { createSupervisorServer } from './server.ts';
import { SupervisorService } from './service.ts';

// Điểm vào ga-supervisor (image gen-agents, entrypoint `supervisor`). Cấu hình xem config.ts; bí mật chỉ từ tệp.

export function buildSupervisor(env: NodeJS.ProcessEnv) {
  const cfg = loadConfig(env);
  const log = stderrLogger('supervisor');
  const rt = new DockerRuntime(dockerFromHost(cfg.dockerHost));
  const broker = new Broker(
    rt,
    {
      runtimeImage: cfg.runtimeImage,
      rolesNetwork: cfg.rolesNetwork,
      enginesVolume: cfg.enginesVolume,
      egressProxyUrl: cfg.egressProxyUrl,
      noProxy: cfg.noProxy,
      fakeEngineSourceUrl: cfg.fakeEngineSourceUrl,
      forbiddenValues: [
        cfg.supervisorKey.toString('hex'),
        cfg.supervisorKey.toString('base64'),
        cfg.termTicketKey.toString('hex'),
        cfg.termTicketKey.toString('base64'),
      ],
    },
    log,
  );
  const svc = new SupervisorService(broker, { ...cfg }, log, systemClock);
  const pty = new PtyRelay(svc, {
    termKey: cfg.termTicketKey,
    allowedOrigins: cfg.termAllowedOrigins,
    maxDurationSeconds: cfg.ptyMaxDurationSeconds,
    clock: systemClock,
    log,
  });
  const server = createSupervisorServer({ svc, pty, supervisorKey: cfg.supervisorKey, clock: systemClock, log });
  return { cfg, log, server, svc, pty, broker };
}

export function startSupervisor(env: NodeJS.ProcessEnv): void {
  const { cfg, log, server } = buildSupervisor(env);
  server.listen(cfg.listenPort, cfg.listenHost, () => log.log('info', 'listening', { port: cfg.listenPort }));
}
