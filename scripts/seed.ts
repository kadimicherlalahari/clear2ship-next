// Loads the 3 sample shipments. Usage: npm run db:seed
// Stop the dev server first when using the local database (PGlite allows one process at a time),
// or use "Reset sample data" in the app as Admin.
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

async function main() {
  const { seedSamples } = await import("../src/lib/seed");
  console.table(await seedSamples());
}

main().catch((err) => {
  console.error(process.env.DEBUG ? err : err.message ?? err);
  process.exit(1);
});
