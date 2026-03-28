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
import crypto from "crypto";

const MIGRATIONS_DIR = path.join(process.cwd(), "src/db/business-migrations");

interface MigrationFile {
  version: string; // e.g. "0002"
  filename: string; // e.g. "0002_add_lang_to_sessions.sql"
  sql: string;
  checksum: string;
}

function calculateChecksum(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
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
    .map((filename) => {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), "utf-8");
      return {
        version: filename.substring(0, 4),
        filename,
        sql,
        checksum: calculateChecksum(sql),
      };
    });
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
      checksum TEXT,
      applied_at TIMESTAMPTZ DEFAULT now()
    )
  `);
}

interface AppliedMigration {
  version: string;
  checksum: string | null;
}

/**
 * Returns which migration versions have already been applied to the schema.
 */
async function getAppliedVersions(
  client: PoolClient,
  schemaName: string
): Promise<Map<string, string | null>> {
  const result = await client.query<AppliedMigration>(
    `SELECT version, checksum FROM "${schemaName}".schema_migrations`
  );
  const map = new Map<string, string | null>();
  for (const row of result.rows) {
    map.set(row.version, row.checksum);
  }
  return map;
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
    const appliedMap = await getAppliedVersions(client, schemaName);

    // Verify checksums of applied migrations
    for (const migration of migrations) {
      if (appliedMap.has(migration.version)) {
        const appliedChecksum = appliedMap.get(migration.version);
        // If there's no checksum in DB (older migrations), skip validation
        if (appliedChecksum && appliedChecksum !== migration.checksum) {
          throw new Error(
            `Migration checksum mismatch for version ${migration.version} in schema ${schemaName}. ` +
            `Expected ${appliedChecksum}, but got ${migration.checksum}. The migration file may have been modified.`
          );
        }
      }
    }

    const pending = migrations.filter((m) => !appliedMap.has(m.version));

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
          `INSERT INTO "${schemaName}".schema_migrations (version, filename, checksum) VALUES ($1, $2, $3)`,
          [migration.version, migration.filename, migration.checksum]
        );
        await client.query("COMMIT");
        console.log(`[migrate-businesses] ${schemaName}: ✓ ${migration.filename}`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err; // Re-throw to be caught by the outer loop
      }
    }
  } catch (err) {
    console.error(`[migrate-businesses] Failed migrating ${schemaName}:`, err);
    throw err;
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
