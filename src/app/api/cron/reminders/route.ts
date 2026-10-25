import { handler, HttpError } from "@/lib/api";
import { runReminders } from "@/lib/email";

/** Called by Vercel Cron. Protected by CRON_SECRET when it is set. */
export const GET = handler(async (req) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) throw new HttpError(401, "Not allowed.");
  return { sent: await runReminders() };
});
