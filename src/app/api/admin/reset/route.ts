import { currentActor, handler, requireRole } from "@/lib/api";
import { seedSamples } from "@/lib/seed";

export const POST = handler(async () => {
  requireRole(await currentActor(), "admin");
  return { shipments: await seedSamples() };
});
