import { auth } from "@/auth";
import { db } from "@/db";
import { businesses } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ businessId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { businessId } = await params;
  const body = await req.json();

  // Verify business exists (authorization should be done via org membership check)
  const [business] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.id, businessId));

  if (!business) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updateData: Record<string, unknown> = { lastUpdatedOn: new Date() };

  if (body.name) {
    // Check uniqueness
    const existing = await db
      .select()
      .from(businesses)
      .where(eq(businesses.name, body.name));
    if (existing.length > 0 && existing[0].id !== businessId) {
      return NextResponse.json(
        { error: "A business with this name already exists" },
        { status: 409 }
      );
    }
    updateData.name = body.name;
  }

  if (body.isActive !== undefined) {
    updateData.isActive = body.isActive;
  }

  const [updated] = await db
    .update(businesses)
    .set(updateData)
    .where(eq(businesses.id, businessId))
    .returning();

  return NextResponse.json(updated);
}
