/**
 * migrate-businesses.ts
 *
 * Custom migration runner for per-business schemas (bus_<businessId>).
 *
 * HOW IT WORKS:
 * - Business schemas are NOT managed by Drizzle Kit.
 * - This runner keeps a `schema_migrations` table inside each business schema
 *   to track which SQL migrations have been applied.
 * - Add new migration files to `src/db/business-migrations/` numbered sequentially:
 *     0001_initial.sql   <- created by createBusinessSchema — never re-run
 *     0002_add_lang_to_sessions.sql
 *     0003_add_tags_to_documents.sql
 *
 * USAGE:
 *   # Apply pending migrations to ALL business schemas:
 *   npx tsx src/db/migrate-businesses.ts
 *
 *   # Apply to a specific business:
 *   npx tsx src/db/migrate-businesses.ts --business <businessId>
 */

import { pool } from "@/db";
import { PoolClient } from "pg";
import fs from "fs";
import path from "path";

const MIGRATIONS_DIR = path.join(process.cwd(), "src/db/business-migrations");

interface MigrationFile {
  version: string; // e.g. "0002"
  filename: string; // e.g. "0002_add_lang_to_sessions.sql"
  sql: string;
}

/**
 * Returns sorted list of migration files from the business-migrations directory,
 * excluding 0001_initial.sql (that's handled by createBusinessSchema).
 */
function loadMigrationFiles(): MigrationFile[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.log("[migrate-businesses] No migrations directory found.");
    return [];
  }

  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter(
      (f) => f.endsWith(".sql") && !f.startsWith("0001_") && f.match(/^\d{4}_/)
    )
    .sort()
    .map((filename) => ({
      version: filename.substring(0, 4),
      filename,
      sql: fs.readFileSync(path.join(MIGRATIONS_DIR, filename), "utf-8"),
    }));
}

/**
 * Ensures the `schema_migrations` tracking table exists in the given schema.
 */
async function ensureMigrationsTable(
  client: PoolClient,
  schemaName: string
): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS "${schemaName}".schema_migrations (
      version TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      applied_at TIMESTAMPTZ DEFAULT now()
    )
  `);
}

/**
 * Returns which migration versions have already been applied to the schema.
 */
async function getAppliedVersions(
  client: PoolClient,
  schemaName: string
): Promise<Set<string>> {
  const result = await client.query<{ version: string }>(
    `SELECT version FROM "${schemaName}".schema_migrations`
  );
  return new Set(result.rows.map((r: { version: string }) => r.version));
}

/**
 * Applies pending migrations to a specific business schema.
 */
async function migrateBusinessSchema(
  businessId: string,
  migrations: MigrationFile[]
): Promise<void> {
  const schemaName = `bus_${businessId}`;
  const client = await pool.connect();

  try {
    await ensureMigrationsTable(client, schemaName);
    const applied = await getAppliedVersions(client, schemaName);

    const pending = migrations.filter((m) => !applied.has(m.version));

    if (pending.length === 0) {
      console.log(`[migrate-businesses] ${schemaName}: up to date`);
      return;
    }

    for (const migration of pending) {
      console.log(`[migrate-businesses] ${schemaName}: applying ${migration.filename}...`);

      await client.query("BEGIN");
      try {
        await client.query(`SET LOCAL search_path TO "${schemaName}"`);
        await client.query(migration.sql);
        await client.query(
          `INSERT INTO "${schemaName}".schema_migrations (version, filename) VALUES ($1, $2)`,
          [migration.version, migration.filename]
        );
        await client.query("COMMIT");
        console.log(`[migrate-businesses] ${schemaName}: ✓ ${migration.filename}`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(
          `Migration ${migration.filename} failed on ${schemaName}: ${err}`
        );
      }
    }
  } finally {
    client.release();
  }
}

/**
 * Runs pending migrations against all business schemas (or a single one).
 */
export async function runBusinessMigrations(targetBusinessId?: string): Promise<void> {
  const migrations = loadMigrationFiles();

  if (migrations.length === 0) {
    console.log("[migrate-businesses] No migrations to apply.");
    return;
  }

  const client = await pool.connect();
  let businessIds: string[];

  try {
    if (targetBusinessId) {
      businessIds = [targetBusinessId];
    } else {
      const result = await client.query<{ nspname: string }>(`
        SELECT nspname FROM pg_catalog.pg_namespace
        WHERE nspname LIKE 'bus_%'
        ORDER BY nspname
      `);
      businessIds = result.rows.map((r) => r.nspname.replace("bus_", ""));
    }
  } finally {
    client.release();
  }

  console.log(
    `[migrate-businesses] Migrating ${businessIds.length} business schema(s), ${migrations.length} migration file(s)...`
  );

  for (const businessId of businessIds) {
    await migrateBusinessSchema(businessId, migrations);
  }

  console.log("[migrate-businesses] Done.");
}

// ─── CLI entry point ──────────────────────────────────────────────────────────
// Run directly: npx tsx src/db/migrate-businesses.ts [--business <businessId>]

if (require.main === module) {
  const idx = process.argv.indexOf("--business");
  const targetId = idx !== -1 ? process.argv[idx + 1] : undefined;

  runBusinessMigrations(targetId)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
