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
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(url);
    return { kind: "neon", query: (text, params = []) => sql.query(text, params) as Promise<Row[]> };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  mkdirSync(join(process.cwd(), ".data"), { recursive: true });
  const pg = new PGlite(join(process.cwd(), ".data", "pglite"));
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
