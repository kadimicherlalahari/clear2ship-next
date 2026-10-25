// Ad-hoc query helper for local debugging: npx tsx scripts/q.ts "SELECT ..."
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
(async () => { const { q } = await import("../src/lib/db"); console.table(await q(process.argv[2])); })();
