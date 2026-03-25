# Minerva Evolution — Real-Time Voice AI Platform

> **Status**: Design Discussion Draft (v2 — incorporating team feedback)  
> **Date**: 2026-03-24  
> **Author**: AI Architect (collaborative with team)

---

## 1. Current State — What Minerva Is Today

Minerva is a **multi-tenant AI conversation platform** built on a **pipeline component architecture**. It currently supports text and voice interactions through a **request-response model** — a full turn is processed synchronously before a response is returned.

### Architecture Summary

```
                           ┌────────────────────────────────────┐
                           │           Core Service             │
   Web UI ──── REST ──────►│                                    │
                           │  STT → Translation → Memory → RAG │
   (Future)                │  → GoalSteering → LLM → TTS       │
   WhatsApp ── Webhook ───►│                                    │
                           │  PipelineContext (shared state)    │
   (Future)                │  PipelineRunner (sequential exec)  │
   Phone ──── ??? ────────►│                                    │
                           └──────────┬─────────────────────────┘
                                      │
                              ┌───────┴───────┐
                              │  PostgreSQL   │
                              │  (Multi-tenant)│
                              └───────────────┘
```

### Key Characteristics

| Aspect | Current State |
|---|---|
| **Processing Model** | Synchronous request-response per turn |
| **Pipeline** | 7 sequential components: STT → Translation → Memory → RAG → GoalSteering → LLM → TTS |
| **API Surface** | REST (`POST /message`) + placeholder WebSocket endpoint |
| **Audio Flow** | Client records full utterance → uploads → server processes fully → returns full audio |
| **Latency Profile** | ~3-5 seconds per turn (STT + LLM + TTS are serial, each making full API calls) |
| **Telephony** | ❌ Not connected |
| **Streaming** | ❌ Full audio in, full audio out |
| **Interruptions** | ❌ User must wait for full response |
| **Tool Calling** | ❌ No function calling or API integrations |
| **Conversation Design** | Hard-coded pipeline order; goal_steering is simple turn-count heuristic |

### What Works Well (and we keep)

- **Provider abstraction** (`ProviderResolver` + registry pattern)
- **Pipeline component architecture** — modular `should_execute` / `execute`
- **Multi-tenant data model** — schema-per-business isolation
- **ConfigCache** — in-memory config with background refresh
- **Fault tolerance** — critical vs non-critical components, fallback providers

---

## 2. The Five Capabilities

---

### Capability 1: FreeSWITCH Telephony Integration

**What**: Connect Minerva to PSTN/SIP telephone networks via FreeSWITCH so that real phone calls reach the AI agent.

**How it works**:

```
PSTN/SIP ──► FreeSWITCH (EC2) ──► WebSocket (audio stream) ──► Minerva Core (ECS)
                                                                      │
              Phone Speaker ◄── FreeSWITCH ◄── WebSocket ◄───────────┘
```

1. **Inbound call** arrives at FreeSWITCH via SIP trunk from du/e& providers in Dubai
2. **Client purchases a toll-free number** from the telco provider and attaches it to the Minerva pipeline
3. **FreeSWITCH dialplan** answers the call, identifies the business (via DID/DNIS → `business_id` mapping), and opens a **WebSocket connection to Minerva Core**, streaming raw audio
4. **Minerva Core** receives audio frames in real-time, processes through streaming pipeline, and streams audio back
5. **FreeSWITCH** plays the response audio to the caller in real-time

**Deployment decision**: FreeSWITCH runs on a **dedicated EC2 instance** (not ECS/Fargate). This is because FreeSWITCH requires direct access to SIP ports (5060/5061), large RTP port ranges (16384-32768), and low-level networking that is difficult to manage in containerized environments.

**Key design decisions**:

- **`mod_audio_fork`**: FreeSWITCH module purpose-built for streaming live call audio to an external WebSocket endpoint
- **DID → Business mapping**: Each toll-free number (DID) maps to a `business_id` in the database. FreeSWITCH queries this via ESL (Event Socket Library) on call setup
- **Codec handling**: FreeSWITCH transcodes all inbound audio to a standard format before streaming to Minerva (see audio format decision in Capability 2)
- **Scaling**: A single FreeSWITCH instance handles hundreds of concurrent calls. For higher volume, multiple EC2 instances behind an SBC (Session Border Controller)
- **Call metadata**: Caller ID, DNIS, call start time passed as WebSocket connection parameters

**Impact on current Minerva**:

- New **Telephony Channel Adapter** (sessions with `channel = "phone"`, telephony metadata: caller_id, did)
- WebSocket endpoint `/api/v1/sessions/{id}/stream` must be fully implemented
- Infrastructure: new EC2 instance with FreeSWITCH, SIP trunk configuration with du/e&

---

### Capability 2: Streaming vs Batch — A Detailed Cost & UX Analysis

**The current batch model** processes a full utterance end-to-end before returning a response:

```
[User speaks 5s] ──wait──► [STT 1s] ──► [LLM 2s] ──► [TTS 1s] ──► [Play 3s]
Total perceived wait: ~4 seconds after user finishes speaking
```

**The streaming model** processes audio as it arrives, overlapping stages:

```
[User speaks...] ──stream──► [STT streaming: partial transcripts]
                                  │ (final transcript ready)
                                  ▼
                             [LLM streaming: tokens arrive]
                                  │ (first sentence ready ~500ms)
                                  ▼
                             [TTS streaming: audio chunks]
                                  │ (first chunk ready)
                                  ▼
                             [Play audio while TTS continues]
Perceived wait to first audio: ~300-500ms
```

#### Cost Comparison

| Factor | Batch Processing | Streaming |
|---|---|---|
| **STT per minute** | $0.004–0.024/min (varies by provider) | Same per-minute rate — no premium for streaming in most providers (Deepgram, Sarvam) |
| **LLM cost** | Identical token cost | Identical token cost (streaming is just a delivery method) |
| **TTS cost** | $4–16/million chars | Same per-char rate — no premium for streaming in most providers |
| **WebSocket connections** | None — HTTP request-response | Persistent connections consume server resources (memory, file descriptors) |
| **Server compute** | Burst: short-lived, high CPU per request | Sustained: lower CPU per connection but held longer |
| **Bandwidth** | One large upload + one large download | Continuous small packets, slightly more overhead from framing |
| **Infrastructure** | Simple stateless HTTP | Requires sticky sessions, connection management, state tracking |

> **Key insight**: The per-API-call cost (STT, LLM, TTS) is identical for streaming and batch with most providers. The cost difference is in **infrastructure**: streaming requires persistent WebSocket connections, more complex server architecture, and slightly more bandwidth overhead. For a platform like Minerva already running ECS with sticky sessions, the incremental infrastructure cost is minimal.

#### Can Optimized Batch Beat Streaming?

The question: *If we bring batch processing response under 2 seconds and add barge-in support and fillers for longer turns, can it match streaming UX at lower cost?*

**Optimized batch approach**:
- Parallel STT + RAG pre-fetch as audio arrives
- Use faster LLM models (Groq Llama with ~200 token/s)
- Sentence-level TTS (generate first sentence immediately while continuing LLM for rest)
- Add verbal fillers ("Let me check...") while processing
- Implement barge-in by monitoring for new audio during response playback

| Aspect | Optimized Batch | Full Streaming | Verdict |
|---|---|---|---|
| **First-byte latency** | ~1.5-2s (still must wait for full STT + first LLM sentence) | ~300-500ms (STT partial → LLM first tokens → TTS first chunk) | 🏆 Streaming wins |
| **Cost per call** | Slightly lower (no persistent connections) | Slightly higher (WebSocket overhead) | 🏆 Batch wins — but difference is ~5-10% |
| **Barge-in quality** | Possible but crude — must detect new audio, cancel playback, re-invoke batch STT | Natural — STT is already listening, just cancel TTS stream | 🏆 Streaming wins |
| **Filler experience** | Programmatic fillers feel robotic; timing is guesswork | No fillers needed — response starts in <500ms | 🏆 Streaming wins |
| **Conversation naturalness** | Noticeable pauses; fillers help but don't eliminate them | Feels like talking to a real person | 🏆 Streaming wins |
| **Implementation complexity** | Medium — some clever optimizations but no protocol changes | High — new streaming pipeline, async generators, cancellation | 🏆 Batch wins |
| **Provider compatibility** | Works with all providers (batch APIs are universal) | Requires streaming APIs from providers | 🏆 Batch wins |

**Recommendation**: 

For **web chat** (text-first, voice-optional): optimized batch is perfectly adequate and simpler. The 1.5-2s response time is acceptable when the user is reading text.

For **phone/telephony** (voice-only, real-time): streaming is essential. On a phone call, even 1.5 seconds of silence feels like an eternity. The <500ms first-byte latency of streaming is what separates a "talking to a bot" experience from a "talking to someone" experience.

**Our approach — Channel-Aware Processing Mode**:

The mode (batch vs streaming) is selected automatically based on the incoming channel and input type:

| Channel | Input Type | Processing Mode | Reason |
|---|---|---|---|
| **WhatsApp** | Text | Batch | Async messaging — user reads response, latency tolerance is 2-3s |
| **Telegram** | Text | Batch | Same as WhatsApp — asynchronous text chat |
| **Web Client** | Text (typed) | Batch | User is reading, not listening. REST endpoint |
| **Web Client** | Audio (voice) | Streaming | User speaking into browser mic — real-time experience expected |
| **Telephone** | Audio | Streaming | Phone call — sub-500ms first-byte latency required |

Both modes share identical pipeline components (STT, LLM, TTS, FlowEngine, ToolExecutor). The difference is in the *delivery layer*: batch returns a complete HTTP response; streaming uses WebSocket with async generators and a sentence buffer. The `channel` and `input_type` fields on `PipelineContext` control which path is taken.

#### Audio Format Decision

For the internal WebSocket audio stream between FreeSWITCH/clients and Minerva Core:

| Format | Bandwidth (mono) | Latency | STT Compatibility | Complexity |
|---|---|---|---|---|
| **PCM 16kHz 16-bit** | 256 kbps | Near-zero (no codec) | ✅ Native input for all STT engines | Simple — raw bytes |
| **Opus** | 12-64 kbps (configurable) | 2.5-26.5ms codec delay | Needs decode to PCM before STT | Requires encode/decode |
| **μ-law 8kHz** | 64 kbps | Near-zero | Telephony standard but lower quality | Simple but low quality |

**Decision**: **Opus** for transmission, decoded to PCM server-side before STT.

**Rationale**: Opus gives us 4-20x bandwidth savings over raw PCM with negligible latency penalty (~5ms). This matters for phone calls over mobile networks and for scaling (less bandwidth per concurrent call). Most AI models expect PCM input, so we decode on arrival — a trivial operation. Opus is also the WebRTC standard, making browser integration seamless.

#### Streaming Provider Support

Good news from team feedback:

- ✅ **Sarvam supports streaming STT** (WebSocket-based)
- ✅ **Sarvam supports streaming TTS** (WebSocket-based)

This means our primary provider (Sarvam) can serve all three streaming stages (STT, LLM via SSE, TTS). Deepgram and ElevenLabs remain as fallback streaming providers.

#### Impact on Current Minerva

- `PipelineRunner` evolves to support **streaming mode** (async generators / event-driven flow)
- `PipelineContext` gets streaming state (`partial_transcript`, `streamed_sentences`, audio chunk queue)
- Provider ABCs get streaming variants: `transcribe_stream()`, `chat_completion_stream()`, `text_to_speech_stream()`
- WebSocket endpoint becomes the primary real-time interface; REST `/message` remains for batch channels
- Sentence buffer utility: accumulates LLM tokens, flushes complete sentences to TTS

---

### Capability 3: Real-Time Interruption Handling (Barge-In)

**What**: Allow the caller to interrupt the AI mid-response, stop playback immediately, and process the new input — just like a natural conversation.

```
AI is speaking response audio...
    │
    ├── User starts talking (VAD detects speech)
    │
    ├── IMMEDIATELY:
    │     1. Stop sending TTS audio to caller
    │     2. Discard remaining queued audio/TTS chunks
    │     3. Cancel in-flight LLM generation (if still streaming)
    │     4. Cancel in-flight TTS generation
    │
    ├── Begin processing new user utterance (STT already listening)
    │
    └── New response cycle begins
```

#### VAD Placement — Detailed Analysis

The user raised an important point: if VAD runs only in FreeSWITCH, web clients don't get barge-in. Here's the full analysis:

| Placement | How it Works | Pros | Cons |
|---|---|---|---|
| **Option A: FreeSWITCH only** | `mod_vad` or `mod_audio_fork` with built-in VAD detects speech on the telephony media stream | Zero extra latency; no audio stream needed to server for detection; battle-tested | ❌ Only works for phone channel. Web clients have no barge-in. Two different code paths. |
| **Option B: Browser only** | Web Audio API + Silero VAD WASM runs in the browser; sends `barge_in` signal via WebSocket | Zero extra latency for web; client handles its own detection | ❌ Only works for web channel. Phone calls still need FreeSWITCH VAD. Client-side code to maintain. |
| **Option C: Minerva Core (centralized)** | All audio streams (from FreeSWITCH and browser) flow through Core. VAD runs server-side on the incoming audio stream | ✅ **Single implementation for all channels.** Consistent behavior. One set of tuning parameters. Easy to update/improve. | Adds 20-50ms latency (audio must reach server before VAD triggers). Slightly more server CPU. |
| **Option D: Hybrid (edge + core)** | FreeSWITCH uses `mod_vad` for phone; browser uses Web Audio API; both send `barge_in` signals to Core which handles cancellation uniformly | Best latency per channel. Core only handles cancellation logic. | Two VAD implementations to maintain and tune. Different sensitivity/behavior per channel. |

**Recommended approach: Option C — Centralized VAD in Minerva Core**

**Rationale**: 
- **Unified behavior across all channels** — phone and web clients get identical barge-in behavior from a single implementation
- The 20-50ms latency penalty is negligible in practice (human perception threshold for "immediate" is ~100ms)
- We already have the audio stream flowing through Core for STT; VAD is just an additional lightweight check on the same stream  
- Silero VAD is a tiny model (~2MB) that runs inference in <1ms per audio frame
- Single place to tune VAD sensitivity, debounce thresholds, and filler-word filtering
- If latency becomes an issue later, we can add edge-side VAD as an optimization (promoting to Option D) without changing Core logic

#### Interruption Types

- **Hard interrupt**: User starts a substantive new sentence → SHOULD interrupt. Cancel TTS/LLM output.
- **Soft interrupt**: Filler sounds ("uh-huh", "hmm", "okay") → should NOT interrupt. Requires classification post-VAD (either by a small classifier model or by checking if the STT transcript is a known backchannel phrase).

#### Impact on Current Minerva

- `PipelineRunner` needs cancellation support (async task cancellation, `CancelledError` propagation)
- `PipelineContext` gets barge-in metadata: `was_interrupted`, `response_heard_until`, `interrupted_at_turn`
- Memory component must track partial responses (what the user actually heard vs. what was discarded)
- WebSocket protocol needs `barge_in` control messages
- Silero VAD integrated as a lightweight background process on the incoming audio stream

---

### Capability 4: Tool Calling / Function Calling

**What**: Give the AI agent the ability to call external tools/APIs during a conversation — check availability, book meetings, look up accounts, transfer to humans, etc.

#### Standardized Tool Types (not per-business custom code)

Rather than defining highly specific one-off tools per business, we use a **catalog of standard tool types** that can be instantiated per-business with their specific configuration:

```yaml
# Tool Type Catalog (platform-level)
tool_types:
  
  # ── Generic API Tool ──────────────────────────────────────────────
  - type: api_tool
    description: "Makes HTTP calls to any client REST API"
    config_schema:
      base_url: { type: string, required: true }
      auth_type: { type: enum, options: [bearer_token, api_key, basic, none] }
      auth_credentials: { type: secret, required: false }
      timeout_seconds: { type: integer, default: 10 }
    # Each instance of api_tool defines specific endpoints:
    instance_schema:
      name: { type: string, required: true }
      description: { type: string, required: true }
      method: { type: enum, options: [GET, POST, PUT, PATCH, DELETE] }
      path: { type: string, required: true }
      parameters: { type: object }  # JSON Schema for LLM function calling
      response_mapping: { type: object }  # How to extract relevant fields from response
  
  # ── Google Calendar Tool ───────────────────────────────────────────
  - type: google_calendar
    description: "Manages appointments via Google Calendar API"
    config_schema:
      service_account_key: { type: secret, required: true }
      calendar_id: { type: string, required: true }
    # Built-in actions (same for all clients, different calendar instance):
    actions:
      - check_availability: "Check if a time slot is free"
      - book_appointment: "Create a calendar event"
      - cancel_appointment: "Cancel an existing event"
      - list_upcoming: "List next N appointments"
  
  # ── Transfer Tool (built-in) ───────────────────────────────────────
  - type: transfer_to_human
    description: "Transfer the call to a human agent"
    config_schema:
      transfer_queue: { type: string }
      sip_endpoint: { type: string }
    # Internal action — triggers FreeSWITCH call transfer
  
  # ── SMS/Notification Tool ──────────────────────────────────────────
  - type: send_notification
    description: "Send SMS or email confirmation"
    config_schema:
      provider: { type: enum, options: [twilio, sns, smtp] }
      from_number: { type: string }
      api_credentials: { type: secret }
```

**Per-business configuration** (each business instantiates tool types with their credentials):

```yaml
# Business: "Dr. Patel's Clinic" — tools config
tools:
  - type: google_calendar
    name: appointment_manager
    config:
      calendar_id: "drpatel@clinic.com"
      service_account_key: "secret:gcp_sa_key_drpatel"
  
  - type: api_tool
    name: patient_lookup
    config:
      base_url: "https://api.drpatel-clinic.com/v1"
      auth_type: bearer_token
      auth_credentials: "secret:drpatel_api_token"
    instances:
      - name: check_patient_record
        description: "Look up a patient by phone number or name"
        method: GET
        path: "/patients/search"
        parameters:
          phone: { type: string, description: "Patient phone number" }
          name: { type: string, description: "Patient name" }
  
  - type: transfer_to_human
    name: human_transfer
    config:
      transfer_queue: "reception"
      sip_endpoint: "sip:reception@drpatel-clinic.com"
```

This approach means:
- **Tool types are built once, used everywhere** — `google_calendar` works identically for Dr. Patel and for Golden Eagle Real Estate, just different calendar credentials
- **`api_tool` is the Swiss Army knife** — any client REST API can be connected without custom code
- **Standard tools get better over time** — improvements to `google_calendar` tool type benefit all businesses using it
- **Security boundary is clear** — credentials are stored per-business, never in tool type code

#### Orchestration: Custom Code vs LangChain/CrewAI

The user asked whether we should use LangChain/CrewAI for tool orchestration or keep custom code. Here's the analysis:

| Aspect | Custom Orchestration (current approach) | LangChain / LangGraph | CrewAI |
|---|---|---|---|
| **What it gives us** | Full control over pipeline, provider abstraction, streaming, barge-in. We own every line of code. | Pre-built agent framework with tool calling, memory, chain-of-thought. LangGraph adds stateful graph execution. | Multi-agent orchestration framework built on LangChain. Agents have roles and collaborate. |
| **Latency control** | ✅ Complete — we control every millisecond. Critical for real-time voice. | ⚠️ Abstraction layers add latency. Tool calls go through LangChain's agent loop. Harder to optimize. | ❌ Designed for complex multi-agent tasks, not real-time voice. Overhead is significant. |
| **Streaming support** | ✅ We build it exactly as needed — async generators, sentence buffer, cancellation. | ⚠️ LangChain has streaming support but it's designed for text chat, not bidirectional audio. Barge-in/VAD not part of the framework. | ❌ Not designed for streaming audio at all. |
| **Voice AI fit** | ✅ Purpose-built for our STT→LLM→TTS pipeline with streaming and barge-in | ⚠️ LangChain/LangGraph are text-first frameworks. No native audio streaming, VAD, or barge-in. We'd still build those ourselves. | ❌ Wrong abstraction level. CrewAI is for "a team of agents doing research" not "a real-time phone conversation". |
| **Tool calling** | We implement the tool-call loop ourselves (~200 lines of code). Standard OpenAI function calling format. | ✅ Built-in tool calling, automatic retry, chain-of-thought reasoning. This is LangChain's sweet spot. | ✅ Built-in. |
| **Vendor lock-in** | ✅ None — we swap providers freely via `ProviderResolver` | ⚠️ Coupled to LangChain's abstractions. Provider changes require LangChain adapters. | ❌ Heavy lock-in to CrewAI's agent model. |
| **Maintenance burden** | ⚠️ We maintain all orchestration code ourselves | ✅ Community-maintained. Bug fixes and new features come free. | ✅ Community-maintained but smaller community. |
| **Learning curve** | ✅ Team already knows the codebase | ⚠️ Team must learn LangChain patterns, debugging LangChain internals is notoriously hard | ⚠️ Team must learn CrewAI patterns |
| **Production maturity** | ✅ We control reliability | ⚠️ LangChain has improved but still has breaking changes between versions. "Framework churn" is a real concern. | ⚠️ Newer, less battle-tested |

**Recommendation: Stay with custom orchestration, adopt OpenAI function calling schema as the standard**

**Rationale**:
1. **Voice AI is our differentiator** — the streaming pipeline, barge-in, VAD, and real-time audio handling are what make Minerva special. LangChain can't help with any of this.
2. **Tool calling is the easy part** — the actual tool-call loop (call LLM → detect tool_call → execute → feed back → repeat) is ~200 lines of Python. It doesn't justify pulling in a heavy framework.
3. **We follow the industry standard** — tool definitions use the **OpenAI function calling JSON schema** (which is now the de facto standard across OpenAI, Anthropic, Groq, and Google). This means any LLM that supports function calling will work with our tool definitions natively.
4. **LangChain/CrewAI add latency** — for a platform where 50ms matters, adding abstraction layers from a text-first framework is counterproductive.
5. **Optionality**: If we ever need complex multi-agent reasoning (e.g., "supervisor agent that delegates to specialist agents"), LangGraph can be adopted for that specific use case without replacing our core pipeline.

#### Tool Execution Timeout Strategy

Based on user requirements, the timeout strategy for tools during live calls:

```
Tool call initiated
    │
    ├── t < 5s: Wait silently (most API calls complete here)
    │
    ├── t = 5s: Play verbal filler: "Just a moment please"
    │           (continue waiting)
    │
    ├── t = 10s: Tool call FAILS (timeout)
    │           Play filler: "Taking longer than expected, please wait"
    │           Start RETRY (attempt 2)
    │
    ├── Retry t < 10s: If response arrives, proceed normally
    │
    └── Retry t = 10s: FINAL FAILURE
                Log the failure (tool name, params, error, business_id)
                Play: "I apologize, I'm unable to complete that action right now.
                       Let me note this down and someone will follow up with you."
                Store in unknown_queries for follow-up
                Continue conversation
```

#### How Tool Calling Works in the Pipeline

```
User: "I'd like to book for tomorrow at 3 PM"
    │
    ├── STT → Translation → Memory → RAG → FlowEngine
    │
    ├── LLM (with tool definitions in function calling format)
    │     └── Returns: tool_call("check_availability", {date: "2026-03-25", time: "15:00"})
    │
    ├── ToolExecutor: calls the configured tool instance
    │     │ (5s filler if slow, 10s timeout+retry if very slow)
    │     └── Returns: {available: true, slot_id: "abc123"}
    │
    ├── LLM (second call with tool result in context)
    │     └── "Great! I've found a slot tomorrow at 3 PM. Shall I confirm?"
    │
    └── TTS → Audio response
```

#### Impact on Current Minerva

- New **ToolExecutor** component (with timeout/retry/filler logic)
- `PipelineContext` gets `tool_calls`, `tool_results` fields
- LLM component gets **tool-call loop** (call LLM → if tool_call → execute → call LLM again)
- Tool definitions stored in `configs` table per-business
- New data model: `tool_executions` table for audit logging
- Provider ABCs support OpenAI function calling format in `chat_completion()`
- Dashboard UI for configuring tool instances per business

---

### Capability 5: Declarative Conversation Flows with Dynamic Intent-Based Switching

**What**: Allow businesses to define multiple conversation flows in YAML, with the agent dynamically selecting and switching between flows based on user intent — all while maintaining the ability to answer RAG-based questions.

#### The Key Insight: Multiple Flows Per Business, Intent-Driven Selection

A business doesn't have just one conversational goal. A healthcare clinic might need:
- **Appointment Booking** flow (most callers)
- **Prescription Refill** flow
- **General Q&A** flow (about hours, location, services)
- **Emergency Redirect** flow

The agent should **detect intent from the first few seconds of conversation** and automatically select the right flow — then dynamically switch if the conversation direction changes.

#### How It Works: Intent → Flow Selection → Dynamic Switching

```
                    ┌──────────────────────────────────────────────┐
                    │              FlowEngine                       │
                    │                                              │
    User speaks ───►│  1. Intent Classifier                       │
                    │     │  "I want to book an appointment"      │
                    │     │  → intent: appointment_booking         │
                    │     │                                        │
                    │  2. Flow Selector                            │
                    │     │  Match intent → flows.appointment      │
                    │     │  Set active_flow = "appointment"       │
                    │     │  Set current_state = "greeting"        │
                    │     │                                        │
                    │  3. State Manager                            │
                    │     │  Generate LLM instructions from state  │
                    │     │  Track collected_fields                │
                    │     │                                        │
                    │  4. Transition Detector                      │
                    │     │  Monitor conversation for:             │
                    │     │  - Flow completion → farewell          │
                    │     │  - Intent change → switch flow         │
                    │     │  - Off-topic → handle per rules        │
                    │     │                                        │
                    └──────────────────────────────────────────────┘
```

#### Example: How Simple Q&A vs Appointment Booking Works

**Scenario 1: Caller wants Q&A**

```
Caller: "Hi, what are your working hours?"
    │
    ├── Intent Classifier: intent = "general_inquiry" (confidence: 0.92)
    ├── Flow Selector: activates flow = "general_qna"
    ├── FlowEngine: No specific state machine needed — RAG mode
    ├── LLM gets instruction: "Answer from knowledge base. Steer towards booking if relevant."
    ├── RAG retrieves: "Our clinic is open Mon-Sat, 9 AM to 6 PM"
    └── Response: "We're open Monday to Saturday, 9 AM to 6 PM. Would you like to book an appointment?"

Caller: "Yes, I'd like to come in tomorrow"
    │
    ├── Intent Classifier: intent = "appointment_booking" (confidence: 0.95)
    ├── ★ FLOW SWITCH: general_qna → appointment_booking
    ├── FlowEngine: activates appointment flow, state = "ask_service"
    ├── Carry forward context (user already expressed interest)
    └── Response: "Of course! What type of visit would you like — consultation, follow-up, or new patient?"
```

**Scenario 2: Caller wants appointment (straight into flow)**

```
Caller: "I need to book an appointment with Dr. Patel"
    │
    ├── Intent Classifier: intent = "appointment_booking" (confidence: 0.97)
    ├── Flow Selector: activates flow = "appointment_booking", state = "greeting"
    ├── LLM guided by flow: "Collect customer_name and service_type"
    └── Response: "I'd be happy to help you book with Dr. Patel! May I have your name please?"

Caller: "It's Rahul. By the way, do you accept insurance?"
    │
    ├── Flow state: still in "appointment_booking", field "customer_name" = "Rahul"
    ├── Off-flow question detected: "do you accept insurance?"
    ├── ★ HYBRID MODE: Question is relevant to business → answer from RAG
    ├── RAG retrieves: "We accept most major insurance providers including..."
    ├── LLM answers the question AND steers back to flow
    └── Response: "Thanks Rahul! Yes, we accept most major insurance providers including 
         Daman and ADNIC. Now, what type of visit did you need — consultation or follow-up?"
    ├── Flow state unchanged: still in "appointment_booking", waiting for "service_type"

Caller: "Can you come again?" (or: "Sorry, could you repeat that?" / "What did you say?")
    │
    ├── Agent detects REPEAT REQUEST — a special meta-intent, not a business question
    ├── ★ NO flow state change, NO RAG call, NO LLM re-generation needed
    ├── Agent replays the last response from PipelineContext.last_assistant_message
    └── Response: [repeats] "What type of visit did you need — consultation or follow-up?"
    ├── Flow state unchanged: still in "appointment_booking", waiting for "service_type"
    │
    │  NOTE — Repeat Request Detection:
    │  Detected via a lightweight pattern match ("come again", "repeat", "say that again",
    │  "didn't catch", "pardon", "what?", "huh?") BEFORE the full pipeline runs.
    │  This saves an entire LLM call and responds instantly (just replays cached audio).
    │  On a phone call, replaying cached TTS audio is near-instantaneous.
    │  If the repeat request is ambiguous, the LLM rephrases more clearly instead of
    │  verbatim replay ("Let me rephrase: What service type would you like — a routine
    │  consultation, a follow-up visit, or a new patient registration?")
```

**Scenario 3: Non-relevant question**

```
Caller: (in appointment flow) "What's the weather like today?"
    │
    ├── Question relevance check: NOT relevant to business context
    ├── ★ Politely refuse, steer back to flow
    └── Response: "I appreciate the question, but I'm best at helping with clinic-related topics!
         Now, shall we continue with your appointment? What time works best for you?"
```

**Scenario 4: Relevant but no info**

```
Caller: (in appointment flow) "Do you do MRI scans?"
    │
    ├── Question relevance check: IS relevant to business (healthcare)
    ├── RAG check: No info found about MRI scans
    ├── ★ Acknowledge + store in unknown tracker + continue flow
    └── Response: "That's a great question about MRI scans. I don't have that information right now,
         but I've noted it down and someone from our team will get back to you. 
         Meanwhile, shall we finish booking your appointment?"
    ├── Unknown query logged: {query: "Do you do MRI scans?", session_id, flow_state}
```

#### Conversation Flow YAML Format

```yaml
# flows.yaml — Dr. Patel's Clinic
business_flows:
  
  # ── Flow 1: Appointment Booking ────────────────────────────
  - name: appointment_booking
    version: 1
    trigger_intents: [book_appointment, schedule_visit, see_doctor]
    priority: 1  # Higher priority = preferred when intents are ambiguous
    
    initial_state: greeting
    
    states:
      greeting:
        agent_says: "I'd be happy to help you book an appointment! May I have your name?"
        collect:
          - field: customer_name
            type: string
            required: true
        next: ask_service
      
      ask_service:
        agent_says: "What type of visit do you need, {customer_name}?"
        collect:
          - field: service_type
            type: enum
            options: [consultation, follow_up, new_patient]
            required: true
        next: ask_datetime
      
      ask_datetime:
        agent_says: "When would you like to come in?"
        collect:
          - field: preferred_date
            type: date
            required: true
          - field: preferred_time
            type: time
            required: true
        next: check_availability
      
      check_availability:
        action:
          tool: appointment_manager.check_availability
          params:
            date: "{preferred_date}"
            time: "{preferred_time}"
        on_success: confirm_booking
        on_failure: suggest_alternative
      
      suggest_alternative:
        agent_says: "That slot isn't available. Next openings are: {alternatives}"
        collect:
          - field: selected_slot
            type: string
            required: true
        next: check_availability  # Loop back
      
      confirm_booking:
        agent_says: "I have {service_type} for {customer_name} on {preferred_date} at {preferred_time}. Confirm?"
        collect:
          - field: confirmation
            type: boolean
        on_yes: execute_booking
        on_no: ask_datetime
      
      execute_booking:
        action:
          tool: appointment_manager.book_appointment
          params:
            name: "{customer_name}"
            date: "{preferred_date}"
            time: "{preferred_time}"
            service: "{service_type}"
        on_success: farewell
        on_failure: apologize
      
      farewell:
        agent_says: "Your appointment is confirmed! You'll receive a confirmation shortly."
        end: true
  
  # ── Flow 2: General Q&A (RAG-driven) ──────────────────────
  - name: general_qna
    version: 1
    trigger_intents: [general_question, hours, location, services, pricing]
    priority: 0  # Default flow when no specific intent matched
    
    initial_state: open_conversation
    
    states:
      open_conversation:
        mode: rag  # No strict state machine — answer from knowledge base
        goal_steering: "If the caller seems interested in a service, gently offer to book an appointment"
        end_condition: "User says goodbye or conversation becomes idle"
  
  # ── Flow 3: Prescription Refill ────────────────────────────
  - name: prescription_refill
    version: 1
    trigger_intents: [refill_prescription, medication, pharmacy]
    priority: 1
    
    initial_state: verify_patient
    
    states:
      verify_patient:
        agent_says: "I can help with your prescription refill. Can I have your patient ID or phone number?"
        collect:
          - field: patient_identifier
            type: string
            required: true
        next: lookup_patient
      
      lookup_patient:
        action:
          tool: patient_lookup.check_patient_record
          params:
            phone: "{patient_identifier}"
        on_success: ask_medication
        on_failure: patient_not_found
      
      # ... continued ...

  # ── Global Handlers (apply to ALL flows) ────────────────────
  global:
    on_out_of_scope: "I can only help with clinic-related topics. Shall we continue?"
    on_frustrated: "I apologize for any inconvenience. Let me transfer you to our reception."
    on_transfer_request:
      action:
        tool: human_transfer
        params:
          reason: "Customer requested transfer"
    max_turns: 20
    timeout_minutes: 10
```

#### Flow State Machine

```
                              ┌─────────────┐
                              │ Call Starts  │
                              └──────┬───────┘
                                     │
                              ┌──────▼───────┐
                              │    Intent     │
                              │  Classifier   │
                              └──────┬───────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │                │                 │
            ┌───────▼──────┐ ┌──────▼───────┐ ┌──────▼───────┐
            │ Appointment  │ │  General Q&A │ │ Prescription │
            │   Booking    │ │  (RAG mode)  │ │   Refill     │
            └───────┬──────┘ └──────┬───────┘ └──────┬───────┘
                    │                │                 │
                    │    ★ Intent change detected ★   │
                    │◄───────────────┤                 │
                    ├───────────────►│                 │
                    │                ├────────────────►│
                    │                │◄────────────────┤
                    │                │                 │
               ┌────▼────┐    ┌─────▼─────┐    ┌─────▼─────┐
               │  Flow   │    │  Answer   │    │  Flow     │
               │ States  │    │ from RAG  │    │  States   │
               └────┬────┘    │ + steer   │    └─────┬─────┘
                    │         └───────────┘          │
                    ▼                                 ▼
               [Farewell]                        [Farewell]
```

#### How the FlowEngine Works (Not Replacing the LLM)

The flow YAML is **NOT a rigid script**. It's a **structured guide** for the LLM:

1. **FlowEngine** reads YAML and determines current state based on collected fields
2. It generates **structured instructions** for the LLM system prompt:
   > "You are in the `ask_datetime` state of the `appointment_booking` flow. You need to collect `preferred_date` and `preferred_time`. Do not move forward until both are collected. If the user asks a question relevant to the business, answer it from context and then steer back to collecting the date/time."
3. The **LLM** handles natural language understanding, entity extraction, and response generation — guided by flow instructions
4. After LLM responds, FlowEngine parses for collected fields and determines next state
5. If user intent changes significantly, FlowEngine triggers a **flow switch** while preserving conversation context

#### Flow Complexity — Initial Scope

As per user decision: **Simple linear flows with branching and loops, clear state management**.

Supported:
- ✅ Linear state sequences (`greeting → ask_name → ask_service → farewell`)
- ✅ Branching (`on_yes → book`, `on_no → reschedule`)
- ✅ Loops (`suggest_alternative → check_availability` — loops until available slot found)
- ✅ Clear state tracking (`current_state`, `collected_fields`, `state_history`)

Not in initial scope (can be added later):
- ❌ Parallel states (e.g., collecting name AND service simultaneously)
- ❌ Sub-flows (flow within a flow)
- ❌ Conditional transitions based on complex expressions

#### Hybrid Mode — How RAG and Flows Coexist

Per user decision, the agent operates in **hybrid mode**:

| Situation | Behavior |
|---|---|
| User asks something **within the active flow** | Follow flow state, collect fields, proceed |
| User asks something **relevant to business, outside flow** | Answer from RAG, then steer back to flow |
| User asks something **not relevant to business** | Politely refuse, steer back to flow |
| User asks something **relevant but no info available** | Acknowledge, store in unknown tracker, continue flow |
| User's **intent changes** to match a different flow | Switch to the new flow, carry context forward |
| **No flow configured** for the business | Default to RAG-based open Q&A (current behavior) |

#### Impact on Current Minerva

- New **FlowEngine** service replaces/extends `GoalSteeringComponent`
- **IntentClassifier** (can be LLM-based or a lightweight classifier) determines which flow to activate
- Flow definitions stored in `configs` table (`config_key = "conversation_flows"`) as YAML/JSON
- `PipelineContext` gets `flow_state` (`active_flow`, `current_state`, `collected_fields`, `state_history`)
- `sessions.goal_state_json` extended to persist flow state across turns
- LLM system prompt dynamically assembled from: flow state instructions + RAG context + conversation history + tool definitions
- Dashboard needs flow management UI (upload/edit YAML, versioning)

---

## 3. How the Five Capabilities Fit Together

```
                    ┌─────────────────────────────────────────────────────────────────┐
                    │                         Minerva Core                            │
                    │                                                                 │
  FreeSWITCH ──────┤  WebSocket Handler                                              │
  (EC2)        ◄───┤    │                                                            │
                    │    ├── Centralized VAD (Silero)                          [Cap 3] │
  Web Client ──────┤    │     │                                                      │
  (Browser)    ◄───┤    │     ├── Detects user speech → triggers barge-in             │
                    │    │     └── Detects end-of-utterance → triggers STT             │
                    │    │                                                            │
                    │    ├── Streaming STT (Sarvam primary)                    [Cap 2] │
                    │    │                                                            │
                    │    ├── IntentClassifier + FlowEngine                     [Cap 5] │
                    │    │     ├── Selects/switches active flow                       │
                    │    │     ├── Generates LLM instructions from state              │
                    │    │     └── Hybrid: RAG answers + flow steering                │
                    │    │                                                            │
                    │    ├── Memory + RAG (existing)                                  │
                    │    │                                                            │
                    │    ├── Streaming LLM (Sarvam primary)                    [Cap 2] │
                    │    │     ├── Token streaming                                    │
                    │    │     ├── Tool call detection + execution             [Cap 4] │
                    │    │     │     ├── Standard tool types (API, Calendar...)        │
                    │    │     │     ├── 5s filler / 10s timeout+retry                │
                    │    │     │     └── Feed result back to LLM                      │
                    │    │     └── Sentence buffer                                    │
                    │    │                                                            │
                    │    ├── Streaming TTS (Sarvam primary)                    [Cap 2] │
                    │    │     └── Audio chunks sent immediately                      │
                    │    │                                                            │
                    │    └── Barge-In Controller                               [Cap 3] │
                    │          └── Cancels LLM + TTS on interruption                  │
                    │                                                         [Cap 1] │
                    └─────────────────────────────────────────────────────────────────┘
```

### Dependency Chain

```
Cap 2 (Streaming) ◄──── Foundation — must be built first
    │
    ├── Cap 1 (FreeSWITCH) ──── builds on streaming WebSocket
    │
    └── Cap 3 (Barge-In) ────── built on streaming + VAD
                                          
Cap 4 (Tool Calling) ◄──── Standalone, but enhanced when combined with Cap 5

Cap 5 (Conversation Flows) ──── Orchestrates Cap 4 tool calls
                               ──── Replaces simple goal steering
```

---

## 4. Resolved Decisions

| # | Question | Decision |
|---|---|---|
| 1 | FreeSWITCH deployment | **Separate EC2 instance** (not containerized) |
| 2 | SIP trunk provider | **du/e& providers in Dubai**. Clients purchase toll-free numbers and attach to pipeline. |
| 3 | Audio format | **Opus** for WebSocket transmission, decoded to PCM server-side (best cost/bandwidth ratio) |
| 4 | STT streaming | **Sarvam supports streaming STT** ✅ — use as primary |
| 5 | TTS streaming | **Sarvam supports streaming TTS** ✅ — use as primary |
| 6 | VAD placement | **Centralized in Minerva Core** — single implementation for all channels |
| 7 | Tool format | **OpenAI function calling schema** (industry standard) + Minerva config layer for endpoints/auth |
| 8 | Orchestration framework | **Custom code** — LangChain/CrewAI not suitable for real-time voice AI. Follow OpenAI standards. |
| 9 | Tool timeout | **5s → filler, 10s → fail+retry, 20s → final fail+log+apologize** |
| 10 | Flow complexity | **Linear with branching and loops**, clear state management |
| 11 | Hybrid mode | **Yes** — flows guide, RAG answers relevant off-flow questions, non-relevant refused, unknowns tracked |
| 12 | Flow selection | **Intent-based dynamic selection** with runtime switching between flows |
| 13 | Tool model | **Standard tool types** (API Tool, Google Calendar, etc.) instantiated per-business |

---

## 5. Implementation Phases

### Phase 1: Streaming Foundation + Interruption Handling (Capabilities 2 + 3)

**Goal**: Make Minerva feel like a real-time conversation — fast, natural, interruptible.

- Channel-aware processing mode routing (batch for text/WhatsApp/Telegram, streaming for audio/phone/web_client)
- Streaming provider interfaces (STT, LLM, TTS) — Sarvam streaming APIs as primary
- Streaming pipeline runner (async generators, sentence buffer)
- Centralized VAD (Silero) for all channels
- Barge-in controller with async cancellation
- Repeat-request detection (instant replay, no LLM call)
- Full WebSocket endpoint implementation
- **Outcome**: Real-time voice conversations on web with interruption support. WhatsApp/Telegram continue on batch path.

---

### Phase 2: Tools + Conversation Flows (Capabilities 4 + 5)

**Goal**: Make the agent intelligent about what to do and capable of taking actions.

These two capabilities are built together because they are tightly coupled: flows define *when* to call tools, and tools only become meaningful within a structured flow.

**Tools (Cap 4)**:
- Standard tool type catalog (API Tool, Google Calendar, Transfer, Notification)
- ToolExecutor with 5s filler / 10s timeout+retry / final failure strategy
- Tool-call loop in LLM component (OpenAI function calling format)
- Tool definitions in business config + audit logging (`tool_executions` table)
- Dashboard: tool instance configuration UI

**Flows (Cap 5)**:
- FlowEngine (YAML parser, state machine, field tracker)
- IntentClassifier for flow selection and runtime switching
- Dynamic flow switching with context preservation
- Hybrid mode (flow + RAG answers + repeat detection + unknown tracking)
- Repeat-request short-circuit (pre-pipeline pattern match)
- Flow version management
- Dashboard: flow editor (YAML upload + versioning)

**Outcome**: Agent follows business-defined flows, switches intents dynamically, calls external tools, answers off-flow questions intelligently, and handles edge cases gracefully.

---

### Phase 3: FreeSWITCH Telephony Integration (Capability 1)

**Goal**: Open the platform to real phone calls.

FreeSWITCH is last because by Phase 3, the streaming pipeline is fully battle-tested on web clients, the flows and tools are working end-to-end, and we understand the real-time behavior well before adding the complexity of telephony infrastructure.

- EC2 instance deployment with FreeSWITCH + `mod_audio_fork`
- Telephony channel adapter (`channel = "phone"`, caller metadata)
- DID → `business_id` mapping (database + FreeSWITCH ESL)
- SIP trunk configuration with du/e& (Dubai)
- Call lifecycle management (answer, hangup, transfer, DTMF)
- End-to-end testing with real toll-free numbers

**Outcome**: Clients purchase toll-free numbers, attach them to their Minerva business profile, and callers get the full real-time AI agent experience over the phone.

---

*This document is a living artifact. All sections are open for discussion, challenge, and refinement.*
