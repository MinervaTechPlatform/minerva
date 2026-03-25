/**
 * GET  /api/orgs        — list all orgs the current user belongs to
 * POST /api/orgs        — create a new org (creates membership as owner)
 */

import { auth } from "@/auth";
import { db } from "@/db";
import { organizations, orgMembers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

// ─── GET /api/orgs ────────────────────────────────────────────────────────────

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Join via org_members to get all orgs the user belongs to, plus their role
  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      plan: organizations.plan,
      isActive: organizations.isActive,
      createdOn: organizations.createdOn,
      role: orgMembers.role,
    })
    .from(orgMembers)
    .innerJoin(organizations, eq(orgMembers.orgId, organizations.id))
    .where(eq(orgMembers.userId, session.user.id));

  return NextResponse.json(rows);
}

// ─── POST /api/orgs ───────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { name } = await req.json();

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json(
      { error: "Organization name is required" },
      { status: 400 }
    );
  }

  // Trial limit: a user can own at most 1 org on trial.
  // Count orgs where this user is the owner.
  const ownedOrgs = await db
    .select({ orgId: orgMembers.orgId })
    .from(orgMembers)
    .where(eq(orgMembers.userId, session.user.id));

  // TODO: check org.plan to lift this limit for pro/enterprise users
  if (ownedOrgs.length >= 1) {
    return NextResponse.json(
      {
        error:
          "Trial plan allows only 1 organization. Upgrade to Pro for more.",
        upgradeRequired: true,
      },
      { status: 403 }
    );
  }

  // Create org + membership in a single transaction
  const [org] = await db
    .insert(organizations)
    .values({
      name: name.trim(),
      plan: "trial",
      createdBy: session.user.id,
    })
    .returning();

  await db.insert(orgMembers).values({
    userId: session.user.id,
    orgId: org.id,
    role: "owner",
  });

  // Return org — schema creation is triggered separately via POST /api/orgs/:id/setup
  return NextResponse.json(org, { status: 201 });
}
