import { defineConfig } from "drizzle-kit";
import fs from "fs";
import path from "path";

const databaseUrl = process.env.DATABASE_URL!;
const parsedUrl = new URL(databaseUrl);
const sslCertPath = path.resolve(process.cwd(), "global-bundle.pem");
const sslCert = fs.existsSync(sslCertPath)
  ? fs.readFileSync(sslCertPath, "utf8")
  : undefined;

console.log("[drizzle.config] Loading Drizzle config");
console.log(
  `[drizzle.config] Target database ${parsedUrl.hostname}:${parsedUrl.port || "5432"}/${decodeURIComponent(parsedUrl.pathname.replace(/^\//, ""))}`
);
console.log(`[drizzle.config] SSL bundle ${sslCert ? "found" : "missing"} at ${sslCertPath}`);

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    host: parsedUrl.hostname,
    port: parsedUrl.port ? Number(parsedUrl.port) : 5432,
    user: decodeURIComponent(parsedUrl.username),
    password: decodeURIComponent(parsedUrl.password),
    database: decodeURIComponent(parsedUrl.pathname.replace(/^\//, "")),
    ...(sslCert
      ? {
          ssl: {
            ca: sslCert,
          },
        }
      : {}),
  },
});
