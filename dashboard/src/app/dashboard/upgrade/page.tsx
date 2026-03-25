import { auth } from "@/auth";
import { db } from "@/db";
import { orgMembers, organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Crown, Zap, Check, Building2, HardDrive, MessageSquare } from "lucide-react";

const PRO_FEATURES = [
  { icon: Building2,    text: "Unlimited businesses" },
  { icon: HardDrive,    text: "10 GB document storage (vs 100 MB on trial)" },
  { icon: MessageSquare,text: "Unlimited text & speech conversations" },
  { icon: Zap,          text: "Priority API throughput" },
  { icon: Crown,        text: "Early access to new features" },
];

export default async function UpgradePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin");

  // Grab first org the user belongs to (for naming & plan check)
  const [membership] = await db
    .select({
      orgId: orgMembers.orgId,
      orgName: organizations.name,
      orgPlan: organizations.plan,
    })
    .from(orgMembers)
    .innerJoin(organizations, eq(orgMembers.orgId, organizations.id))
    .where(eq(orgMembers.userId, session.user.id))
    .limit(1);

  // If already on Pro, send them home
  if (membership?.orgPlan === "pro") redirect("/dashboard");

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-2xl space-y-8">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-semibold text-foreground flex items-center justify-center gap-2">
            <Crown className="w-6 h-6 text-amber-500" />
            Upgrade to Pro
          </h1>
          <p className="text-muted-foreground text-sm">
            Unlock the full power of Minerva for your team.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Trial card */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Trial</CardTitle>
                <Badge variant="outline" className="text-xs">Current</Badge>
              </div>
              <CardDescription>Good for getting started</CardDescription>
              <p className="text-3xl font-bold text-foreground mt-2">Free</p>
            </CardHeader>
            <CardContent className="space-y-2">
              {["1 organization", "1 business", "100 MB storage", "10 text chats / month", "10 voice sessions / month"].map((t) => (
                <div key={t} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Check className="w-4 h-4 mt-0.5 shrink-0 opacity-40" />
                  <span>{t}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Pro card */}
          <Card className="border-primary/40 bg-primary/5 shadow-md shadow-primary/10">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Pro</CardTitle>
                <div className="flex items-center gap-2">
                  <Badge className="bg-primary text-primary-foreground text-xs px-2 py-0.5">
                    Recommended
                  </Badge>
                  <Crown className="w-4 h-4 text-amber-500" />
                </div>
              </div>
              <CardDescription>For growing teams</CardDescription>
              <div className="mt-2">
                <span className="text-3xl font-bold text-foreground">$49</span>
                <span className="text-muted-foreground text-sm"> / month</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {PRO_FEATURES.map((f) => (
                <div key={f.text} className="flex items-start gap-2 text-sm">
                  <Check className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                  <span className="text-foreground">{f.text}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* CTA */}
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-6 text-center space-y-4">
          <p className="text-sm text-muted-foreground">
            Your plan applies across all your organizations and businesses.
            One subscription unlocks Pro features everywhere.
          </p>
          {/* TODO: wire up Stripe / payment provider */}
          <button className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold px-6 h-10 hover:bg-primary/90 transition-colors shadow-md shadow-primary/20">
            <Zap className="w-4 h-4" />
            Upgrade now
          </button>
          <div>
            <a
              href="/dashboard"
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
            >
              Back to dashboard
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
