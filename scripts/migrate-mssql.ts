import { drizzle } from "drizzle-orm/node-mssql";
import { migrate } from "drizzle-orm/node-mssql/migrator";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.");
}

const db = drizzle(databaseUrl);

try {
  const result = await migrate(db, {
    migrationsFolder: "./drizzle/mssql",
    migrationsTable: "__drizzle_migrations",
    migrationsSchema: "dbo",
  });

  if (result && "error" in result) {
    throw result.error;
  }

  console.log("Microsoft SQL Server migrations are up to date.");
} finally {
  const pool = await db.$client.$instance();
  await pool.close();
}
