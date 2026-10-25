// Creates the tables. Usage: npm run db:migrate
// Uses Neon when DATABASE_URL is set, otherwise the local PGlite database in ./.data/pglite.
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

async function main() {
  const { q, dbKind, schemaStatements } = await import("../src/lib/db");
  const statements = schemaStatements();
  for (const statement of statements) await q(statement);
  const tables = await q(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
  );
  console.log(`Schema applied to ${await dbKind()} (${statements.length} statements). Tables:`);
  for (const t of tables) console.log("  -", t.table_name);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
