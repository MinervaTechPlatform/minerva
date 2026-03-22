#!/usr/bin/env node
/**
 * run-tenant-migrations.mjs
 *
 * Plain JavaScript (ESM) runner for tenant schema migrations.
 * Called from dashboard-entrypoint.sh. Designed to work inside the
 * Next.js standalone Docker image alongside the migrate-tools bundle.
 *
 * Reads migration files from ./tenant-migrations/ (relative to this file)
 * and applies pending ones to every org_* schema in the database.
 * Skips 0001_*.sql — those are handled by createOrgSchema.
 */

import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "tenant-migrations");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: fs.existsSync("/app/global-bundle.pem")
    ? { ca: fs.readFileSync("/app/global-bundle.pem", "utf8") }
    : undefined,
});

function loadMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.log("[migrate-tenants] No tenant-migrations directory found — skipping.");
    return [];
  }

  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql") && !f.startsWith("0001_") && /^\d{4}_/.test(f))
    .sort()
    .map((filename) => ({
      version: filename.substring(0, 4),
      filename,
      sql: fs.readFileSync(path.join(MIGRATIONS_DIR, filename), "utf-8"),
    }));
}

async function ensureMigrationsTable(client, schemaName) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS "${schemaName}".schema_migrations (
      version TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      applied_at TIMESTAMPTZ DEFAULT now()
    )
  `);
}

async function getAppliedVersions(client, schemaName) {
  const result = await client.query(
    `SELECT version FROM "${schemaName}".schema_migrations`
  );
  return new Set(result.rows.map((r) => r.version));
}

async function migrateOrgSchema(orgId, migrations) {
  const schemaName = `org_${orgId}`;
  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client, schemaName);
    const applied = await getAppliedVersions(client, schemaName);
    const pending = migrations.filter((m) => !applied.has(m.version));

    if (pending.length === 0) {
      console.log(`[migrate-tenants] ${schemaName}: up to date`);
      return;
    }

    for (const migration of pending) {
      console.log(`[migrate-tenants] ${schemaName}: applying ${migration.filename}...`);
      await client.query("BEGIN");
      try {
        await client.query(`SET LOCAL search_path TO "${schemaName}"`);
        await client.query(migration.sql);
        await client.query(
          `INSERT INTO "${schemaName}".schema_migrations (version, filename) VALUES ($1, $2)`,
          [migration.version, migration.filename]
        );
        await client.query("COMMIT");
        console.log(`[migrate-tenants] ${schemaName}: ✓ ${migration.filename}`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${migration.filename} failed on ${schemaName}: ${err}`);
      }
    }
  } finally {
    client.release();
  }
}

async function main() {
  const migrations = loadMigrationFiles();

  if (migrations.length === 0) {
    console.log("[migrate-tenants] No tenant migrations to apply.");
    await pool.end();
    return;
  }

  // Discover all org_* schemas
  const client = await pool.connect();
  let orgIds;
  try {
    const result = await client.query(`
      SELECT nspname FROM pg_catalog.pg_namespace
      WHERE nspname LIKE 'org_%'
      ORDER BY nspname
    `);
    orgIds = result.rows.map((r) => r.nspname.replace("org_", ""));
  } finally {
    client.release();
  }

  console.log(
    `[migrate-tenants] Migrating ${orgIds.length} org schema(s), ${migrations.length} migration file(s)...`
  );

  for (const orgId of orgIds) {
    await migrateOrgSchema(orgId, migrations);
  }

  console.log("[migrate-tenants] Done.");
  await pool.end();
}

main().catch((err) => {
  console.error("[migrate-tenants] Fatal error:", err);
  process.exit(1);
});
