import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * One tiny query interface for both databases:
 *  - DATABASE_URL set   → Neon (production / Vercel)
 *  - DATABASE_URL empty → PGlite, a local Postgres stored in ./.data/pglite (for running locally)
 * The schema is the same SQL file for both.
 */
export type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export type Query = (text: string, params?: unknown[]) => Promise<Row[]>;

type Backend = { query: Query; kind: "neon" | "pglite" };

const g = globalThis as unknown as { __c2sDb?: Promise<Backend> };

/** Postgres type id for DATE. Both databases return it as plain "YYYY-MM-DD" text. */
const DATE_OID = 1082;

export function schemaStatements(): string[] {
  const schema = readFileSync(join(process.cwd(), "db", "schema.sql"), "utf8");
  // Drop "-- comments" first (also ones after a statement), then split on ";" at line ends.
  return schema
    .replace(/--.*$/gm, "")
    .split(/;\s*$/m)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function connect(): Promise<Backend> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { neon, types } = await import("@neondatabase/serverless");
    const sql = neon(url);
    // DATE columns stay as "YYYY-MM-DD" text: turning them into JS dates at local midnight shifts them a day.
    // (Neon only applies type parsers given per query.)
    const dateAsText = {
      getTypeParser: ((oid: number, format?: "text" | "binary") => (oid === DATE_OID ? (v: string) => v : types.getTypeParser(oid, format as never))) as never,
    };
    return { kind: "neon", query: (text, params = []) => sql.query(text, params, { types: dateAsText } as never) as Promise<Row[]> };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  mkdirSync(join(process.cwd(), ".data"), { recursive: true });
  const pg = new PGlite(join(process.cwd(), ".data", "pglite"), { parsers: { [DATE_OID]: (v: string) => v } });
  for (const statement of schemaStatements()) await pg.query(statement);
  return {
    kind: "pglite",
    query: async (text, params = []) => (await pg.query<Row>(text, params)).rows,
  };
}

function backend(): Promise<Backend> {
  g.__c2sDb ??= connect();
  return g.__c2sDb;
}

/** Run one SQL statement with $1, $2… parameters and get the rows back. */
export const q: Query = async (text, params) => (await backend()).query(text, params);

export async function dbKind() {
  return (await backend()).kind;
}
