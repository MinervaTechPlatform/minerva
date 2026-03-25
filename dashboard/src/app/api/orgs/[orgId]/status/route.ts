/**
 * GET /api/orgs/[orgId]/status
 *
 * Previously polled for org-level schema creation. With the new per-business
 * schema architecture (bus_<businessId>), schemas are created when businesses
 * are created, not at the org level.
 *
 * This endpoint now always returns { status: "ready" } for authenticated org members.
 */

import { auth } from "@/auth";
import { db } from "@/db";
import { orgMembers } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(
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

  // Schemas are now created per-business — org setup is always "ready"
  return NextResponse.json({ orgId, status: "ready" });
}
