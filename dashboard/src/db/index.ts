import { drizzle } from "drizzle-orm/node-postgres";
import fs from "fs";
import path from "path";
import { Pool } from "pg";
import * as schema from "./schema";

const sslCertPath = path.resolve(process.cwd(), "global-bundle.pem");
const sslCert = fs.existsSync(sslCertPath)
  ? fs.readFileSync(sslCertPath, "utf8")
  : undefined;

// Export pool so setup-business.ts can acquire raw clients for DDL transactions
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  ...(sslCert
    ? {
        ssl: {
          ca: sslCert,
        },
      }
    : {}),
});

export const db = drizzle(pool, { schema });
