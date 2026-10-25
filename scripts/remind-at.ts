// Runs the reminder check as if it were N hours from now (to test the 24h / 48h alerts locally).
// Usage (dev server stopped when using the local database): npx tsx scripts/remind-at.ts 20
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
(async () => {
  const { runReminders } = await import("../src/lib/email");
  const hours = Number(process.argv[2] ?? 0);
  console.log(`Reminder check at now + ${hours} h:`, await runReminders(new Date(Date.now() + hours * 36e5)));
})();
