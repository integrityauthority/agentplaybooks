import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-mssql";
import { playbooks } from "../src/lib/db/schema/mssql";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.");
}

const db = drizzle(databaseUrl);
const userId = crypto.randomUUID();
const guid = `mssql-smoke-${crypto.randomUUID()}`;

try {
  const [created] = await db.insert(playbooks).output({
    id: playbooks.id,
    guid: playbooks.guid,
    config: playbooks.config,
    tags: playbooks.tags,
  }).values({
    user_id: userId,
    guid,
    name: "MSSQL smoke test",
    config: { source: "scripts/smoke-mssql.ts" },
    tags: ["smoke-test"],
  });

  if (
    !created
    || created.guid !== guid
    || created.config?.source !== "scripts/smoke-mssql.ts"
    || created.tags?.[0] !== "smoke-test"
  ) {
    throw new Error("MSSQL insert/JSON round-trip validation failed.");
  }

  const [selected] = await db
    .select({ id: playbooks.id })
    .from(playbooks)
    .where(eq(playbooks.id, created.id));

  if (!selected) {
    throw new Error("MSSQL select validation failed.");
  }

  await db.delete(playbooks).where(eq(playbooks.id, created.id));
  console.log("Microsoft SQL Server smoke test passed.");
} finally {
  const pool = await db.$client.$instance();
  await pool.close();
}
