/**
 * /api/testing/message — Server-side proxy for Core message processing.
 *
 * Calls Core POST /api/v1/sessions/{sessionId}/message/stream (SSE) and
 * pipes the stream back to the browser. Falls back to the non-streaming
 * endpoint if the stream endpoint is unavailable.
 *
 * SSE events forwarded:
 *   data: {"delta": "<token>"}
 *   data: {"done": true, "session_id": "...", "is_complete": bool, "latency_ms": {...}}
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
      `${CORE_API_URL}/api/v1/sessions/${sessionId}/message/stream`,
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
      console.error("[testing/message] Core stream failed:", errorBody);

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

    // Pipe the SSE stream directly back to the client
    return new Response(coreRes.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    console.error("[testing/message] Failed to reach Core:", err);
    return NextResponse.json(
      { error: "Could not connect to Core engine. Is CORE_API_URL correct?" },
      { status: 503 }
    );
  }
}
