import { auth } from "@/auth";
import { db } from "@/db";
import { businesses, organizations } from "@/db/schema";
import { getBusinessSchema } from "@/db/business-schema";
import { eq, sum } from "drizzle-orm";
import { redirect } from "next/navigation";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Crown, HardDrive, MessageSquare, Mic, Building2, Zap } from "lucide-react";
import Link from "next/link";

export default async function UsagePage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin");

  const { businessId } = await params;

  const [business] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.id, businessId));

  if (!business) redirect("/");

  // Fetch real plan from org
  const [org] = await db
    .select({ plan: organizations.plan, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, business.orgId));

  const plan = org?.plan ?? "trial";
  const isTrialPlan = plan === "trial";

  const t = getBusinessSchema(businessId);
  const [storageResult] = await db
    .select({ totalSize: sum(t.documents.size) })
    .from(t.documents);

  const totalStorage = Number(storageResult?.totalSize || 0);

  // Count businesses in org
  const orgBusinessCount = await db
    .select({ id: businesses.id })
    .from(businesses)
    .where(eq(businesses.orgId, business.orgId));

  const usageItems = [
    {
      label: "Businesses",
      used: orgBusinessCount.length,
      limit: isTrialPlan ? 1 : "∞",
      percentage: isTrialPlan ? (orgBusinessCount.length / 1) * 100 : 10,
      icon: Building2,
      color: "text-violet-500 dark:text-violet-400",
    },
    {
      label: "Document Storage",
      used: `${(totalStorage / (1024 * 1024)).toFixed(1)} MB`,
      limit: isTrialPlan ? "100 MB" : "10 GB",
      percentage: isTrialPlan
        ? (totalStorage / (100 * 1024 * 1024)) * 100
        : (totalStorage / (10 * 1024 * 1024 * 1024)) * 100,
      icon: HardDrive,
      color: "text-blue-500 dark:text-blue-400",
    },
    {
      label: "Text Chat Requests",
      used: "0",
      limit: isTrialPlan ? "10" : "Credits-based",
      percentage: 0,
      icon: MessageSquare,
      color: "text-emerald-500 dark:text-emerald-400",
    },
    {
      label: "Speech Chat Requests",
      used: "0",
      limit: isTrialPlan ? "10" : "Credits-based",
      percentage: 0,
      icon: Mic,
      color: "text-amber-500 dark:text-amber-400",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Usage</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor usage for <span className="font-medium text-foreground">{org?.name}</span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Crown className={`w-4 h-4 ${isTrialPlan ? "text-muted-foreground" : "text-amber-500"}`} />
            <Badge variant="outline" className="capitalize text-xs">{plan}</Badge>
          </div>
          {isTrialPlan && (
            <Link
              href="/dashboard/upgrade"
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 hover:bg-primary/15 border border-primary/20 text-primary text-xs font-semibold px-3 h-8 transition-colors"
            >
              <Zap className="w-3.5 h-3.5" />
              Upgrade to Pro
            </Link>
          )}
        </div>
      </div>

      {/* Usage metrics */}
      <div className="grid gap-4 md:grid-cols-2">
        {usageItems.map((item) => (
          <Card key={item.label}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <item.icon className={`w-4 h-4 ${item.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{item.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.used} / {item.limit}
                  </p>
                </div>
              </div>
              <Progress value={Math.min(item.percentage, 100)} className="h-1.5" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Upgrade nudge for trial */}
      {isTrialPlan && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-foreground">
              You&apos;re on the Trial plan
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Upgrade to Pro for unlimited businesses, 10 GB storage, and more.
            </p>
          </div>
          <Link
            href={`/dashboard/${businessId}/upgrade`}
            className="shrink-0 inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold px-4 h-9 hover:bg-primary/90 transition-colors shadow"
          >
            <Zap className="w-4 h-4" />
            Upgrade
          </Link>
        </div>
      )}
    </div>
  );
}
