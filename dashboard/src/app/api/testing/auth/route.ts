/**
 * /api/testing/auth — Server-side proxy for Core authentication.
 *
 * Looks up the full api_key from the DB (never exposed to the browser),
 * calls Core POST /api/v1/auth/token, then creates a new session via
 * Core POST /api/v1/sessions/, and returns the token + session_id.
 */

import { auth } from "@/auth";
import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";

const CORE_API_URL = process.env.CORE_API_URL ?? "http://localhost:8000";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { apiKeyId, businessId } = await req.json();
  if (!apiKeyId || !businessId) {
    return NextResponse.json(
      { error: "apiKeyId and businessId are required" },
      { status: 400 }
    );
  }

  // Fetch the full api_key value from the database
  const [keyRecord] = await db
    .select({ apiKey: apiKeys.apiKey, isActive: apiKeys.isActive })
    .from(apiKeys)
    .where(and(eq(apiKeys.id, apiKeyId), eq(apiKeys.businessId, businessId)));

  if (!keyRecord) {
    return NextResponse.json({ error: "API key not found" }, { status: 404 });
  }

  if (!keyRecord.isActive) {
    return NextResponse.json(
      { error: "API key is inactive" },
      { status: 403 }
    );
  }

  // Step 1: Exchange api_key for a JWT from Core
  let token: string;
  let coreBusinessId: string;
  try {
    const tokenRes = await fetch(`${CORE_API_URL}/api/v1/auth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: keyRecord.apiKey,
        user_identifier: `dashboard-tester-${session.user.id}`,
        channel: "web",
      }),
    });

    if (!tokenRes.ok) {
      const errorBody = await tokenRes.text();
      console.error("[testing/auth] Core auth failed:", errorBody);
      return NextResponse.json(
        { error: "Core authentication failed", detail: errorBody },
        { status: tokenRes.status }
      );
    }

    const tokenData = await tokenRes.json();
    token = tokenData.token;
    coreBusinessId = tokenData.business_id;
  } catch (err) {
    console.error("[testing/auth] Failed to reach Core:", err);
    return NextResponse.json(
      { error: "Could not connect to Core engine. Is CORE_API_URL correct?" },
      { status: 503 }
    );
  }

  // Step 2: Create a new session on Core
  let sessionId: string;
  try {
    const sessionRes = await fetch(`${CORE_API_URL}/api/v1/sessions/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!sessionRes.ok) {
      const errorBody = await sessionRes.text();
      console.error("[testing/auth] Core session creation failed:", errorBody);
      return NextResponse.json(
        { error: "Failed to create Core session", detail: errorBody },
        { status: sessionRes.status }
      );
    }

    const sessionData = await sessionRes.json();
    sessionId = sessionData.session_id;
  } catch (err) {
    console.error("[testing/auth] Failed to create session:", err);
    return NextResponse.json(
      { error: "Could not create session on Core engine" },
      { status: 503 }
    );
  }

  return NextResponse.json({ token, sessionId, coreBusinessId });
}
