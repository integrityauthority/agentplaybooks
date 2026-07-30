import { describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/node-mssql";
import { getDatabaseDialect } from "./index";
import { playbooks } from "./schema/mssql";

describe("database dialect selection", () => {
  it.each([
    [undefined, "postgres"],
    ["postgres", "postgres"],
    ["postgresql", "postgres"],
    ["mssql", "mssql"],
    ["sqlserver", "mssql"],
    [" MSSQL ", "mssql"],
  ] as const)("maps %s to %s", (configured, expected) => {
    expect(getDatabaseDialect(configured)).toBe(expected);
  });

  it("rejects unknown database dialects", () => {
    expect(() => getDatabaseDialect("oracle")).toThrow(
      'Unsupported DB_DIALECT "oracle"',
    );
  });
});

describe("Microsoft SQL Server query generation", () => {
  it("uses OUTPUT and serializes JSON values", () => {
    const db = drizzle.mock();
    const query = db
      .insert(playbooks)
      .output({ id: playbooks.id })
      .values({
        user_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        guid: "mssql-test",
        name: "MSSQL test",
        config: { enabled: true },
        tags: ["enterprise"],
      })
      .toSQL();

    expect(query.sql.toLowerCase()).toContain("output inserted.[id]");
    expect(query.params).toContain('{"enabled":true}');
    expect(query.params).toContain('["enterprise"]');
  });
});
