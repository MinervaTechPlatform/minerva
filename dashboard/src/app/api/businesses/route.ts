import { auth } from "@/auth";
import { db } from "@/db";
import { businesses, organizations, orgMembers } from "@/db/schema";
import { eq, inArray, and } from "drizzle-orm";
import { NextResponse } from "next/server";
import { createBusinessSchema } from "@/db/setup-business";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch all orgs this user belongs to, then their businesses
  const userOrgs = await db
    .select({ orgId: orgMembers.orgId })
    .from(orgMembers)
    .where(eq(orgMembers.userId, session.user.id));

  if (userOrgs.length === 0) {
    return NextResponse.json([]);
  }

  const orgIds = userOrgs.map((o) => o.orgId);
  const userBusinesses = await db
    .select()
    .from(businesses)
    .where(inArray(businesses.orgId, orgIds));

  return NextResponse.json(userBusinesses);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { name, orgId, industry, goal, slug } = await req.json();

  if (!name || !orgId) {
    return NextResponse.json(
      { error: "Name and orgId are required" },
      { status: 400 }
    );
  }

  // Verify user belongs to this org
  const [membership] = await db
    .select()
    .from(orgMembers)
    .where(
      and(eq(orgMembers.userId, session.user.id), eq(orgMembers.orgId, orgId))
    );

  if (!membership) {
    return NextResponse.json(
      { error: "You are not a member of this organization" },
      { status: 403 }
    );
  }

  // Fetch org plan to enforce trial limit
  const [org] = await db
    .select({ plan: organizations.plan })
    .from(organizations)
    .where(eq(organizations.id, orgId));

  const plan = org?.plan ?? "trial";

  if (plan === "trial") {
    const existingInOrg = await db
      .select({ id: businesses.id })
      .from(businesses)
      .where(eq(businesses.orgId, orgId));

    if (existingInOrg.length >= 1) {
      return NextResponse.json(
        {
          error: "Trial plan allows only 1 business per organization.",
          upgradeRequired: true,
        },
        { status: 403 }
      );
    }
  }

  // Check uniqueness by slug
  const businessSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  const existing = await db
    .select()
    .from(businesses)
    .where(eq(businesses.slug, businessSlug));

  if (existing.length > 0) {
    return NextResponse.json(
      { error: "A business with this name/slug already exists" },
      { status: 409 }
    );
  }

  const [business] = await db
    .insert(businesses)
    .values({
      name,
      orgId,
      slug: businessSlug,
      schemaName: `bus_placeholder`, // will be updated after insert
      industry,
      goal,
      createdBy: session.user.id,
    })
    .returning();

  // Now set the real schemaName based on the generated business ID
  const realSchemaName = `bus_${business.id}`;
  await db
    .update(businesses)
    .set({ schemaName: realSchemaName })
    .where(eq(businesses.id, business.id));

  const finalBusiness = { ...business, schemaName: realSchemaName };

  // Fire and forget — schema creation runs in background
  createBusinessSchema(business.id).catch((err) => {
    console.error(`[businesses] Failed to create schema for business ${business.id}:`, err);
  });

  return NextResponse.json(finalBusiness, { status: 201 });
}
