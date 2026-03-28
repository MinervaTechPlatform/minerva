"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Send,
  Mic,
  MicOff,
  Bot,
  User,
  Volume2,
  MessageSquare,
  Sparkles,
  Key,
  Plus,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  mode: "text" | "speech";
  timestamp: Date;
  latencyMs?: Record<string, number>;
  isError?: boolean;
}

type SessionState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; token: string; sessionId: string }
  | { status: "error"; message: string };

// ─── Main Component ──────────────────────────────────────────────────────────

export default function TestingPage() {
  const params = useParams();
  const router = useRouter();
  const businessId = params.businessId as string;

  // API key state
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(true);
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null);

  // Session state
  const [sessionState, setSessionState] = useState<SessionState>({ status: "idle" });

  // Chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isSpeechMode, setIsSpeechMode] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  // ─── Auto-scroll ────────────────────────────────────────────────────────
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // ─── Fetch API Keys ──────────────────────────────────────────────────────
  const fetchApiKeys = useCallback(async () => {
    setLoadingKeys(true);
    try {
      const res = await fetch(`/api/businesses/${businessId}/api-keys`);
      if (res.ok) {
        const data: ApiKey[] = await res.json();
        setApiKeys(data);
      }
    } catch {
      toast.error("Failed to load API keys");
    } finally {
      setLoadingKeys(false);
    }
  }, [businessId]);

  useEffect(() => {
    fetchApiKeys();
  }, [fetchApiKeys]);

  // ─── Authenticate + Create Session ──────────────────────────────────────
  const startSession = useCallback(async (keyId: string) => {
    setSessionState({ status: "loading" });
    setMessages([]);

    try {
      const res = await fetch("/api/testing/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKeyId: keyId, businessId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setSessionState({ status: "error", message: data.error ?? "Authentication failed" });
        return;
      }

      setSessionState({
        status: "ready",
        token: data.token,
        sessionId: data.sessionId,
      });
    } catch {
      setSessionState({ status: "error", message: "Could not reach Core engine" });
    }
  }, [businessId]);

  // Automatically start a session when a key is selected
  const handleKeySelect = (keyId: string | null) => {
    if (!keyId) return;
    setSelectedKeyId(keyId);
    startSession(keyId);
  };

  // ─── Send Message ────────────────────────────────────────────────────────
  const sendMessage = async (content: string, mode: "text" | "speech") => {
    if (!content.trim()) return;
    if (sessionState.status !== "ready") return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content,
      mode,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsSending(true);

    try {
      const res = await fetch("/api/testing/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionState.sessionId,
          token: sessionState.token,
          text: content,
          language: "en-IN",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        // Session expired — prompt re-auth
        if (res.status === 401 || data.code === "EXPIRED") {
          setSessionState({ status: "error", message: "Session expired. Please re-select an API key." });
          toast.error("Session expired — re-select your API key to continue");
          return;
        }

        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content: `⚠️ Error from Core: ${data.error ?? "Unknown error"}${data.detail ? `\n\n${data.detail}` : ""}`,
            mode,
            timestamp: new Date(),
            isError: true,
          },
        ]);
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: data.responseText,
          mode,
          timestamp: new Date(),
          latencyMs: data.latencyMs,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: "⚠️ Could not reach the Core engine. Check that CORE_API_URL is correct.",
          mode,
          timestamp: new Date(),
          isError: true,
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input, "text");
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      setIsRecording(false);
      // In production this would capture real audio; for now simulate transcript
      setTimeout(() => {
        sendMessage(
          "This is a simulated speech transcript. Connect a real STT provider to enable voice input.",
          "speech"
        );
      }, 500);
    } else {
      setIsRecording(true);
    }
  };

  // ─── Derived state ───────────────────────────────────────────────────────
  const isReady = sessionState.status === "ready";
  const isSessionLoading = sessionState.status === "loading";
  const selectedKey = apiKeys.find((k) => k.id === selectedKeyId);

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 h-[calc(100vh-8rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between shrink-0 gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Testing</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Test your AI speech bot with text or voice
          </p>
        </div>

        {/* Mode toggle */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-card rounded-lg border border-border px-3 py-2">
            <MessageSquare
              className={`w-4 h-4 ${!isSpeechMode ? "text-primary" : "text-muted-foreground"}`}
            />
            <Switch
              checked={isSpeechMode}
              onCheckedChange={setIsSpeechMode}
            />
            <Mic
              className={`w-4 h-4 ${isSpeechMode ? "text-primary" : "text-muted-foreground"}`}
            />
          </div>
          <Badge variant="outline" className="text-xs">
            {isSpeechMode ? "Speech Mode" : "Text Mode"}
          </Badge>
        </div>
      </div>

      {/* API Key Selector */}
      <div className="shrink-0">
        <Card className="border-border/60">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-3">
              <Key className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground shrink-0">API Key:</span>

              {loadingKeys ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading keys…
                </div>
              ) : apiKeys.length === 0 ? (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">
                    No API keys found.
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1.5"
                    onClick={() =>
                      router.push(`/dashboard/${businessId}/settings?tab=api-keys`)
                    }
                  >
                    <Plus className="w-3 h-3" />
                    Create API Key
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-3 flex-1">
                  <Select
                    value={selectedKeyId ?? ""}
                    onValueChange={handleKeySelect}
                  >
                    <SelectTrigger className="h-8 text-sm max-w-xs">
                      <SelectValue placeholder="Select an API key…" />
                    </SelectTrigger>
                    <SelectContent>
                      {apiKeys.map((key) => (
                        <SelectItem key={key.id} value={key.id}>
                          <span className="font-medium">{key.name}</span>
                          <span className="text-muted-foreground ml-2 font-mono text-xs">
                            {key.keyPrefix}
                          </span>
                        </SelectItem>
                      ))}
                      <div className="border-t border-border mt-1 pt-1">
                        <button
                          className="w-full text-left px-2 py-1.5 text-sm text-primary hover:bg-muted rounded-sm flex items-center gap-1.5"
                          onClick={() =>
                            router.push(
                              `/dashboard/${businessId}/settings?tab=api-keys`
                            )
                          }
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Create new API key
                        </button>
                      </div>
                    </SelectContent>
                  </Select>

                  {/* Session status pill */}
                  {isSessionLoading && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Connecting…
                    </div>
                  )}
                  {sessionState.status === "ready" && (
                    <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Connected
                    </div>
                  )}
                  {sessionState.status === "error" && (
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 text-xs text-destructive">
                        <AlertCircle className="w-3.5 h-3.5" />
                        {sessionState.message}
                      </div>
                      {selectedKeyId && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-xs gap-1"
                          onClick={() => startSession(selectedKeyId)}
                        >
                          <RefreshCw className="w-3 h-3" />
                          Retry
                        </Button>
                      )}
                    </div>
                  )}

                  {/* New session button */}
                  {isReady && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs gap-1.5 ml-auto"
                      onClick={() => selectedKeyId && startSession(selectedKeyId)}
                    >
                      <RefreshCw className="w-3 h-3" />
                      New Session
                    </Button>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Chat area */}
      <Card className="flex-1 flex flex-col overflow-hidden">
        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-16">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                <Sparkles className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">
                {!selectedKeyId
                  ? "Select an API key to start"
                  : isSessionLoading
                  ? "Connecting to Core…"
                  : sessionState.status === "error"
                  ? "Connection failed"
                  : "Start a conversation"}
              </h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                {!selectedKeyId
                  ? "Choose an API key from the dropdown above to connect to the Core engine"
                  : isSessionLoading
                  ? "Authenticating and creating a session…"
                  : sessionState.status === "error"
                  ? sessionState.message
                  : isSpeechMode
                  ? "Click the microphone button to start speaking"
                  : "Type a message below to begin chatting with Minerva"}
              </p>
              {isReady && selectedKey && (
                <p className="text-xs text-muted-foreground mt-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-1.5">
                  ✓ Connected using <span className="font-medium">{selectedKey.name}</span>
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-3 ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {message.role === "assistant" && (
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-sm ${message.isError ? "bg-destructive/20" : "bg-primary"}`}>
                      <Bot className={`w-4 h-4 ${message.isError ? "text-destructive" : "text-primary-foreground"}`} />
                    </div>
                  )}
                  <div
                    className={`max-w-[70%] rounded-2xl px-4 py-3 ${
                      message.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : message.isError
                        ? "bg-destructive/10 border border-destructive/20 text-destructive rounded-bl-md"
                        : "bg-muted text-foreground rounded-bl-md"
                    }`}
                  >
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
                    <div
                      className={`flex items-center gap-1.5 mt-1.5 text-xs ${
                        message.role === "user"
                          ? "text-primary-foreground/60"
                          : "text-muted-foreground"
                      }`}
                    >
                      {message.mode === "speech" && <Volume2 className="w-3 h-3" />}
                      <span>
                        {message.timestamp.toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      {message.latencyMs && (
                        <span className="ml-1 opacity-60">
                          · {Object.values(message.latencyMs).reduce((s, v) => s + v, 0).toFixed(0)}ms
                        </span>
                      )}
                    </div>
                  </div>
                  {message.role === "user" && (
                    <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <User className="w-4 h-4 text-muted-foreground" />
                    </div>
                  )}
                </div>
              ))}

              {isSending && (
                <div className="flex gap-3 justify-start">
                  <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0 shadow-sm">
                    <Bot className="w-4 h-4 text-primary-foreground" />
                  </div>
                  <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
                    <div className="flex gap-1.5">
                      <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" />
                      <div
                        className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce"
                        style={{ animationDelay: "0.1s" }}
                      />
                      <div
                        className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce"
                        style={{ animationDelay: "0.2s" }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        {/* Input area */}
        <div className="border-t border-border p-4 bg-card/50">
          {isSpeechMode ? (
            <div className="flex flex-col items-center gap-3">
              <button
                onClick={toggleRecording}
                disabled={!isReady || isSending}
                className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 cursor-pointer ${
                  isRecording
                    ? "bg-red-500 shadow-lg shadow-red-500/25 scale-110"
                    : !isReady || isSending
                    ? "bg-muted cursor-not-allowed"
                    : "bg-primary shadow-lg shadow-primary/25 hover:scale-105"
                }`}
              >
                {isRecording ? (
                  <MicOff className="w-6 h-6 text-white" />
                ) : (
                  <Mic className="w-6 h-6 text-primary-foreground" />
                )}
              </button>
              <p className="text-xs text-muted-foreground">
                {!isReady
                  ? "Select an API key to enable voice"
                  : isRecording
                  ? "Recording… Click to stop"
                  : "Click to start recording"}
              </p>
              {isRecording && (
                <div className="flex items-center gap-1">
                  {[...Array(5)].map((_, i) => (
                    <div
                      key={i}
                      className="w-1 bg-red-400 rounded-full animate-pulse"
                      style={{
                        height: `${Math.random() * 24 + 8}px`,
                        animationDelay: `${i * 0.1}s`,
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  !isReady
                    ? "Select an API key above to start chatting…"
                    : "Type your message…"
                }
                disabled={!isReady || isSending}
                className="resize-none min-h-[44px] max-h-[120px]"
                rows={1}
              />
              <Button
                onClick={() => sendMessage(input, "text")}
                disabled={!input.trim() || !isReady || isSending}
                className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm shrink-0"
                size="icon"
              >
                {isSending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
