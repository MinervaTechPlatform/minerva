"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Bot, Loader2, Sparkles, ArrowRight, Building2, ChevronRight, Plus, Check, Zap } from "lucide-react";

// ─── Options ─────────────────────────────────────────────────────────────────

const INDUSTRIES = [
  { value: "Warehouse & Logistics", label: "Warehouse & Logistics" },
  { value: "Fintech", label: "Fintech" },
  { value: "Real Estate", label: "Real Estate" },
  { value: "Healthcare", label: "Healthcare" },
  { value: "Education", label: "Education" },
  { value: "Other", label: "Other" },
];

const GOALS = [
  { value: "Customer Support", label: "Customer Support" },
  { value: "Lead Generation", label: "Lead Generation" },
  { value: "Sales Assistance", label: "Sales Assistance" },
  { value: "User Onboarding", label: "User Onboarding" },
  { value: "Feedback Collection", label: "Feedback Collection" },
];

// ─── Types ───────────────────────────────────────────────────────────────────

type FlowStep =
  | "org"          // Step 1: select or create org
  | "business"     // Step 2: enter business name, industry, goal
  | "provisioning" // Waiting for schema creation
  | "done";        // Ready — redirect

interface ExistingOrg {
  id: string;
  name: string;
  plan: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter();

  const [step, setStep] = useState<FlowStep>("org");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Form values
  const [orgName, setOrgName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [industry, setIndustry] = useState("");
  const [goal, setGoal] = useState("");

  // IDs populated after API calls
  const [orgId, setOrgId] = useState("");
  const [businessId, setBusinessId] = useState("");
  // Set when trial limit hit — used to show upgrade link
  const [upgradeOrgId, setUpgradeOrgId] = useState("");

  // Org selection state
  const [existingOrgs, setExistingOrgs] = useState<ExistingOrg[]>([]);
  // "" = nothing selected, "new" = create new org, or an existing org's id
  const [selectedOrgOption, setSelectedOrgOption] = useState<string>("");

  // Provisioning status message (cycles while polling)
  const [provStatus, setProvStatus] = useState("Creating your workspace...");

  // Load existing orgs on mount
  useEffect(() => {
    fetch("/api/orgs")
      .then((r) => r.json())
      .then((orgs: ExistingOrg[]) => {
        if (Array.isArray(orgs) && orgs.length > 0) {
          setExistingOrgs(orgs);
          // Pre-select first org by default
          setSelectedOrgOption(orgs[0].id);
          setOrgId(orgs[0].id);
          setOrgName(orgs[0].name);
        } else {
          // No orgs yet — default to creating a new one
          setSelectedOrgOption("new");
        }
      })
      .catch(() => {
        setSelectedOrgOption("new");
      });
  }, []);

  function handleOrgOptionSelect(option: string) {
    setSelectedOrgOption(option);
    setError("");
    if (option === "new") {
      setOrgId("");
      setOrgName("");
    } else {
      const org = existingOrgs.find((o) => o.id === option);
      if (org) {
        setOrgId(org.id);
        setOrgName(org.name);
      }
    }
  }

  // ─── Step 1: Select or create org ─────────────────────────────────────────

  async function handleOrgContinue(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (selectedOrgOption === "new") {
      // Create the org first
      setLoading(true);
      try {
        const res = await fetch("/api/orgs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: orgName }),
        });
        const data = await res.json();
        if (!res.ok) {
          if (data.upgradeRequired) {
            setUpgradeOrgId("dashboard"); // signal to show upgrade button
          }
          setError(data.error || "Failed to create organization.");
          setLoading(false);
          return;
        }
        setOrgId(data.id);
      } catch {
        setError("Something went wrong. Please try again.");
        setLoading(false);
        return;
      }
      setLoading(false);
    }
    // orgId already set for existing org selection
    setStep("business");
  }

  // ─── Step 2: Create business + trigger schema provisioning ─────────────────

  async function handleCreateBusiness(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // 1. Create business record FIRST (so trial limit check runs)
      const res = await fetch("/api/businesses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: businessName, orgId, industry, goal }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.upgradeRequired) {
          // Trial limit hit — redirect to upgrade page
          // We need a businessId for the upgrade URL; use the existing first business
          setUpgradeOrgId(orgId);
          setError(data.error);
        } else {
          setError(data.error || "Failed to create business.");
        }
        setLoading(false);
        return;
      }

      const newBusinessId = data.id;
      setBusinessId(newBusinessId);
      setStep("provisioning");

      // 2. Trigger async schema creation (fire-and-forget)
      await fetch(`/api/orgs/${orgId}/setup`, { method: "POST" });

      // 3. Poll for schema readiness
      setProvStatus("Setting up your workspace...");
      await pollForReady(orgId, newBusinessId);

    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  // ─── Polling ───────────────────────────────────────────────────────────────

  async function pollForReady(id: string, bizId?: string) {
    const resolvedBizId = bizId || businessId;
    const messages = [
      "Setting up your workspace...",
      "Initialising database schema...",
      "Configuring your AI space...",
      "Almost ready...",
    ];
    let attempt = 0;

    while (true) {
      setProvStatus(messages[attempt % messages.length]);
      await wait(1500);

      try {
        const res = await fetch(`/api/orgs/${id}/status`);
        const data = await res.json();

        if (data.status === "ready") {
          setStep("done");
          await wait(800);
          router.refresh();
          router.push(`/dashboard/${resolvedBizId}`);
          return;
        }
      } catch {
        // Ignore transient fetch errors, keep polling
      }

      attempt++;
      if (attempt > 60) {
        setError("Setup is taking longer than expected. Please refresh the page.");
        setStep("business");
        setLoading(false);
        return;
      }
    }
  }

  function wait(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // ─── Provisioning / Done screens ──────────────────────────────────────────

  if (step === "provisioning" || step === "done") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-6 max-w-sm px-4">
          <div className="relative inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary shadow-lg shadow-primary/20">
            <Bot className="w-10 h-10 text-primary-foreground" />
            {step === "provisioning" && (
              <div className="absolute inset-0 rounded-2xl border-2 border-primary/50 animate-ping" />
            )}
          </div>

          <div>
            <h2 className="text-xl font-semibold text-foreground">
              {step === "provisioning" ? provStatus : "All set!"}
            </h2>
            <p className="text-muted-foreground mt-2 text-sm">
              {step === "provisioning"
                ? "This only takes a moment. Sit tight."
                : "Redirecting you to your dashboard..."}
            </p>
          </div>

          {step === "provisioning" && (
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span className="text-sm text-primary">Working...</span>
            </div>
          )}
          {step === "done" && (
            <div className="flex items-center justify-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
              <span className="text-sm text-emerald-600 dark:text-emerald-400">Ready!</span>
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>
      </div>
    );
  }

  // ─── Form ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg space-y-4">

        {/* Progress indicator */}
        <div className="flex items-center gap-2 justify-center mb-6">
          <StepBadge n={1} label="Organization" active={step === "org"} done={step === "business"} />
          <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
          <StepBadge n={2} label="Business" active={step === "business"} done={false} />
        </div>

        <Card className="shadow-xl">
          <CardHeader className="text-center space-y-1 pb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary mx-auto mb-2 shadow-lg shadow-primary/20">
              {step === "org" ? (
                <Building2 className="w-6 h-6 text-primary-foreground" />
              ) : (
                <Bot className="w-6 h-6 text-primary-foreground" />
              )}
            </div>

            {step === "org" ? (
              <>
                <CardTitle className="text-xl">
                  {existingOrgs.length > 0 ? "Choose an Organization" : "Create your Organization"}
                </CardTitle>
                <CardDescription>
                  {existingOrgs.length > 0
                    ? "Select an existing org or create a new one for this business."
                    : "An organization is your top-level workspace. You can add multiple businesses inside it."}
                </CardDescription>
              </>
            ) : (
              <>
                <CardTitle className="text-xl">Set up your first Business</CardTitle>
                <CardDescription>
                  A business is where your AI bot lives. You can always add more later.
                </CardDescription>
              </>
            )}
          </CardHeader>

          <CardContent>
            {/* ── Step 1: Org form ── */}
            {step === "org" && (
              <form onSubmit={handleOrgContinue} className="space-y-4">

                {/* Existing org cards */}
                {existingOrgs.length > 0 && (
                  <div className="space-y-2">
                    {existingOrgs.map((org) => (
                      <button
                        key={org.id}
                        type="button"
                        onClick={() => handleOrgOptionSelect(org.id)}
                        className={`w-full flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
                          selectedOrgOption === org.id
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/40 hover:bg-muted/40"
                        }`}
                      >
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <Building2 className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{org.name}</p>
                          <p className="text-xs text-muted-foreground capitalize">{org.plan} plan</p>
                        </div>
                        {selectedOrgOption === org.id && (
                          <Check className="w-4 h-4 text-primary shrink-0" />
                        )}
                      </button>
                    ))}

                    {/* Create new org option */}
                    <button
                      type="button"
                      onClick={() => handleOrgOptionSelect("new")}
                      className={`w-full flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
                        selectedOrgOption === "new"
                          ? "border-primary bg-primary/5"
                          : "border-dashed border-border hover:border-primary/40 hover:bg-muted/40"
                      }`}
                    >
                      <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        <Plus className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <p className="text-sm font-medium text-foreground">Create a new organization</p>
                      {selectedOrgOption === "new" && (
                        <Check className="w-4 h-4 text-primary shrink-0 ml-auto" />
                      )}
                    </button>
                  </div>
                )}

                {/* Name input — shown when creating a new org */}
                {selectedOrgOption === "new" && (
                  <div className="space-y-2">
                    <Label htmlFor="orgName">Organization Name</Label>
                    <Input
                      id="orgName"
                      placeholder="e.g. Acme Inc."
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      required
                      autoFocus
                    />
                    <p className="text-xs text-muted-foreground">
                      This is the name of your company or team.
                    </p>
                  </div>
                )}

                {/* Show upgrade block for org trial limit */}
                {upgradeOrgId && (
                  <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3 space-y-3">
                    <p className="text-sm text-amber-700 dark:text-amber-400">{error}</p>
                    <button
                      type="button"
                      onClick={() => router.push("/dashboard/upgrade")}
                      className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold px-3 h-7 hover:bg-primary/90 transition-colors"
                    >
                      <Zap className="w-3 h-3" />
                      Upgrade to Pro
                    </button>
                  </div>
                )}
                {error && !upgradeOrgId && (
                  <div className="rounded-lg bg-destructive/10 px-3 py-2">
                    <p className="text-sm text-destructive">{error}</p>
                  </div>
                )}

                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => router.push("/dashboard")}
                    disabled={loading}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="flex-grow bg-primary hover:bg-primary/90 text-primary-foreground shadow-md"
                    disabled={
                      loading ||
                      !selectedOrgOption ||
                      (selectedOrgOption === "new" && !orgName.trim())
                    }
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        Continue
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </>
                    )}
                  </Button>
                </div>
              </form>
            )}

            {/* ── Step 2: Business form ── */}
            {step === "business" && (
              <form onSubmit={handleCreateBusiness} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="businessName">Business Name</Label>
                  <Input
                    id="businessName"
                    placeholder="e.g. Acme Support Bot"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    required
                    autoFocus
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="industry">Industry</Label>
                  <Select value={industry} onValueChange={(v) => setIndustry(v ?? "")} required>
                    <SelectTrigger id="industry">
                      <SelectValue placeholder="Select industry">
                        {industry}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {INDUSTRIES.map((i) => (
                        <SelectItem key={i.value} value={i.value}>
                          {i.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="goal">Primary Goal</Label>
                  <Select value={goal} onValueChange={(v) => setGoal(v ?? "")} required>
                    <SelectTrigger id="goal">
                      <SelectValue placeholder="Select goal">
                        {goal}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {GOALS.map((g) => (
                        <SelectItem key={g.value} value={g.value}>
                          {g.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Error / upgrade-required */}
                {upgradeOrgId && (
                  <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3 space-y-3">
                    <p className="text-sm text-amber-700 dark:text-amber-400">{error}</p>
                    <button
                      type="button"
                      onClick={() => router.push("/dashboard/upgrade")}
                      className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold px-3 h-7 hover:bg-primary/90 transition-colors"
                    >
                      <Zap className="w-3 h-3" />
                      Upgrade to Pro
                    </button>
                  </div>
                )}
                {error && !upgradeOrgId && (
                  <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                    {error}
                  </p>
                )}

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setStep("org")}
                    disabled={loading}
                  >
                    Back
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="flex-1"
                    onClick={() => router.push("/dashboard")}
                    disabled={loading}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="flex-2 flex-grow bg-primary hover:bg-primary/90 text-primary-foreground shadow-md"
                    disabled={loading || !businessName.trim() || !industry || !goal || !!upgradeOrgId}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        Launch
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </>
                    )}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Helper component ─────────────────────────────────────────────────────────

function StepBadge({
  n,
  label,
  active,
  done,
}: {
  n: number;
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
          active
            ? "bg-primary text-primary-foreground"
            : done
            ? "bg-emerald-500 text-white"
            : "bg-muted text-muted-foreground"
        }`}
      >
        {n}
      </div>
      <span
        className={`text-sm ${
          active ? "text-foreground font-medium" : "text-muted-foreground"
        }`}
      >
        {label}
      </span>
    </div>
  );
}
