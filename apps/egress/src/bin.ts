import { startEgress } from './main.ts';

// `node apps/egress/src/bin.ts` — tiến trình ga-egress. Lỗi cấu hình ⇒ thoát 1 (fail-closed).
startEgress(process.env).catch((e: unknown) => {
  process.stderr.write(
    `${JSON.stringify({ level: 'error', svc: 'egress', event: 'start_failed', message: (e as Error).message })}\n`,
  );
  process.exit(1);
});
