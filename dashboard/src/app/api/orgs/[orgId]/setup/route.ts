/**
 * POST /api/orgs/[orgId]/setup
 *
 * Previously triggered schema creation for an org. With the new per-business
 * schema architecture (bus_<businessId>), schema creation now happens
 * automatically when a business is created via POST /api/businesses.
 *
 * This endpoint is kept for backward compatibility but is now a no-op that
 * simply verifies the org exists and the user belongs to it.
 */

import { auth } from "@/auth";
import { db } from "@/db";
import { organizations, orgMembers } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orgId } = await params;

  // Verify the user belongs to this org
  const [membership] = await db
    .select()
    .from(orgMembers)
    .where(
      and(eq(orgMembers.userId, session.user.id), eq(orgMembers.orgId, orgId))
    );

  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Verify org exists and is active
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, orgId));

  if (!org) {
    return NextResponse.json({ error: "Org not found" }, { status: 404 });
  }

  // Schema creation now happens per-business when POST /api/businesses is called.
  return NextResponse.json({ status: "ready", orgId }, { status: 200 });
}
