/**
 * /api/testing/message — Server-side proxy for Core message processing.
 *
 * Forwards a text message to Core POST /api/v1/sessions/{sessionId}/message
 * using the JWT token obtained from /api/testing/auth. Returns the
 * response_text and latency_ms from Core.
 */

import { auth } from "@/auth";
import { NextResponse } from "next/server";

const CORE_API_URL = process.env.CORE_API_URL ?? "http://localhost:8000";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId, token, text, language } = await req.json();
  if (!sessionId || !token) {
    return NextResponse.json(
      { error: "sessionId and token are required" },
      { status: 400 }
    );
  }

  if (!text?.trim()) {
    return NextResponse.json(
      { error: "Message text is required" },
      { status: 400 }
    );
  }

  // Build multipart form-data as required by Core's sessions endpoint
  const formData = new FormData();
  formData.append("text", text);
  formData.append("language", language ?? "en-IN");

  try {
    const coreRes = await fetch(
      `${CORE_API_URL}/api/v1/sessions/${sessionId}/message`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      }
    );

    if (!coreRes.ok) {
      const errorBody = await coreRes.text();
      console.error("[testing/message] Core message failed:", errorBody);

      // Token expired – client should re-authenticate
      if (coreRes.status === 401) {
        return NextResponse.json(
          { error: "Session expired. Please re-select an API key.", code: "EXPIRED" },
          { status: 401 }
        );
      }

      return NextResponse.json(
        { error: "Core engine error", detail: errorBody },
        { status: coreRes.status }
      );
    }

    const data = await coreRes.json();
    return NextResponse.json({
      responseText: data.response_text,
      latencyMs: data.latency_ms,
      isComplete: data.is_complete,
    });
  } catch (err) {
    console.error("[testing/message] Failed to reach Core:", err);
    return NextResponse.json(
      { error: "Could not connect to Core engine. Is CORE_API_URL correct?" },
      { status: 503 }
    );
  }
}
