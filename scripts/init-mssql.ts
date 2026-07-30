import mssql from "mssql";

const masterUrl = process.env.MSSQL_MASTER_URL;
const databaseName = process.env.MSSQL_DATABASE || "agentplaybooks";

if (!masterUrl) {
  throw new Error("MSSQL_MASTER_URL is required.");
}

if (!/^[A-Za-z0-9_-]+$/.test(databaseName)) {
  throw new Error(
    "MSSQL_DATABASE may only contain letters, numbers, underscores and hyphens.",
  );
}

const pool = await mssql.connect(masterUrl);

try {
  const escapedName = databaseName.replaceAll("]", "]]");
  await pool.request()
    .input("databaseName", mssql.NVarChar(128), databaseName)
    .query(`
      IF DB_ID(@databaseName) IS NULL
      BEGIN
        EXEC(N'CREATE DATABASE [${escapedName}]');
      END
    `);
  console.log(`Microsoft SQL Server database "${databaseName}" is ready.`);
} finally {
  await pool.close();
}
