// Small helpers for route handlers: who is acting (role switcher cookie), role checks, JSON errors.
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { Actor } from "./shipments";

export const ROLES = ["seller", "warehouse", "forwarder", "carrier", "admin"] as const;
export type Role = (typeof ROLES)[number];

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function currentActor(): Promise<Actor & { role: Role }> {
  const jar = await cookies();
  const role = (ROLES as readonly string[]).includes(jar.get("c2s_role")?.value ?? "") ? (jar.get("c2s_role")!.value as Role) : "seller";
  const name = decodeURIComponent(jar.get("c2s_name")?.value ?? "").slice(0, 60) || null;
  return { role, name };
}

const ROLE_NAME: Record<Role, string> = { seller: "Seller", warehouse: "Warehouse", forwarder: "Freight forwarder", carrier: "Carrier", admin: "Admin" };

export function requireRole(actor: { role: Role }, ...allowed: Role[]) {
  if (!allowed.includes(actor.role)) {
    throw new HttpError(403, `Only ${allowed.map((r) => ROLE_NAME[r]).join(" or ")} can do this. Switch role at the top of the page.`);
  }
}

type Ctx = { params: Promise<Record<string, string>> };

/** Wrap a handler: returns JSON, turns thrown errors into { error } with a friendly message. */
export function handler(fn: (req: Request, params: Record<string, string>) => Promise<unknown>) {
  return async (req: Request, ctx: Ctx) => {
    try {
      const out = await fn(req, ctx?.params ? await ctx.params : {});
      return out instanceof Response ? out : NextResponse.json(out ?? { ok: true });
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      console.error(e);
      return NextResponse.json({ error: e instanceof Error ? e.message : "Something went wrong." }, { status: 500 });
    }
  };
}
