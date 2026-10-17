// Backend giả của web (CHỈ dev / test). Chuỗi MARKER dưới đây để test quét gói build: bản phát hành KHÔNG được chứa nó.
export const FAKE_BACKEND_MARKER = 'GA_FAKE_BACKEND_9f3c1d2e';
export {
  createFakeBackend,
  type FakeBackend,
  type FakeBackendOptions,
  type FakeControl,
  type FakeEventInput,
} from './backend.ts';
export { FIXTURE_IDS, FIXTURES } from './fixtures.ts';
export { FakeBackendError, FakeFixtureError, FakeHttpError } from './http.ts';
export { verifyFixtures } from './run.ts';
export { createSeed, type FakeDb, type SeedOptions } from './seed.ts';
