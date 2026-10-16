export {
  compareSemver,
  loadMigrations,
  MigrationFileError,
  type MigrationKind,
  type MigrationSet,
  type ObjectType,
  parseObjects,
  parseRepeatable,
  parseVersioned,
  type RepeatableScript,
  renderObject,
  type SqlObject,
  sha256Hex,
  type VersionedMigration,
} from './files.ts';
export {
  ChecksumMismatchError,
  IncompatibleSchemaError,
  type MigrateOptions,
  type MigrateResult,
  MigrationError,
  migrate,
} from './runner.ts';

import { fileURLToPath } from 'node:url';

/** Thư mục migration SQLite đi kèm package. */
export const SQLITE_MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations/sqlite', import.meta.url));
