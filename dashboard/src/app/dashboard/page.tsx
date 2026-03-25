import { auth } from "@/auth";
import { db } from "@/db";
import { organizations, businesses, orgMembers } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { Bot, Building2, Plus, ArrowRight, LogOut } from "lucide-react";
import Link from "next/link";
import { signOut } from "@/auth";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin");

  // Fetch all orgs user belongs to with their businesses
  const memberships = await db
    .select({
      orgId: orgMembers.orgId,
      role: orgMembers.role,
      orgName: organizations.name,
      orgPlan: organizations.plan,
      orgActive: organizations.isActive,
    })
    .from(orgMembers)
    .innerJoin(organizations, eq(orgMembers.orgId, organizations.id))
    .where(eq(orgMembers.userId, session.user.id));

  const orgIds = memberships.map((m) => m.orgId);

  const allBusinesses =
    orgIds.length > 0
      ? await db
          .select()
          .from(businesses)
          .where(inArray(businesses.orgId, orgIds))
      : [];

  // Group businesses by org
  const businessesByOrg = Object.fromEntries(
    memberships.map((m) => [
      m.orgId,
      allBusinesses.filter((b) => b.orgId === m.orgId),
    ])
  );

  const hasNoOrg = memberships.length === 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Top nav */}
      <header className="h-14 border-b border-border bg-card/80 backdrop-blur-sm flex items-center justify-between px-6">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
            <Bot className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-semibold text-foreground">Minerva</span>
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Avatar className="w-8 h-8 border border-border">
            <AvatarImage src={session.user.image || ""} />
            <AvatarFallback className="bg-primary/15 text-primary text-xs">
              {session.user.name?.charAt(0) || "U"}
            </AvatarFallback>
          </Avatar>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/auth/signin" });
            }}
          >
            <button
              type="submit"
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </form>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10 space-y-10">
        {/* Heading */}
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-foreground">
            Welcome back{session.user.name ? `, ${session.user.name.split(" ")[0]}` : ""}
          </h1>
          <p className="text-muted-foreground text-sm">
            Select a business to open its dashboard, or create a new one.
          </p>
        </div>

        {/* No org yet → onboarding CTA */}
        {hasNoOrg && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Building2 className="w-7 h-7 text-primary" />
              </div>
              <div className="text-center">
                <p className="font-medium text-foreground">No organization yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Create your organization to get started.
                </p>
              </div>
              <Link
                href="/onboarding"
                className="mt-2 inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-medium px-3 h-8 hover:bg-primary/90 transition-colors"
              >
                Get started
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </CardContent>
          </Card>
        )}

        {/* Orgs + businesses */}
        {memberships.map((org) => {
          const orgBusinesses = businessesByOrg[org.orgId] ?? [];
          return (
            <section key={org.orgId} className="space-y-3">
              {/* Org header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-foreground">
                    {org.orgName}
                  </h2>
                  <Badge variant="outline" className="text-xs capitalize">
                    {org.orgPlan}
                  </Badge>
                  <Badge variant="outline" className="text-xs capitalize text-muted-foreground">
                    {org.role}
                  </Badge>
                </div>
                <Link
                  href="/onboarding"
                  className="inline-flex items-center justify-center rounded-lg text-sm font-medium px-2.5 h-7 hover:bg-muted hover:text-foreground transition-colors"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  New Business
                </Link>
              </div>

              {/* Businesses grid */}
              {orgBusinesses.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="flex flex-col items-center justify-center py-10 gap-3">
                    <Bot className="w-8 h-8 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">
                      No businesses yet in this organization.
                    </p>
                    <Link
                      href="/onboarding"
                      className="inline-flex items-center justify-center rounded-lg border border-border bg-background text-sm font-medium px-2.5 h-7 hover:bg-muted transition-colors"
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Create Business
                    </Link>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {orgBusinesses.map((biz) => (
                    <Link
                      key={biz.id}
                      href={`/dashboard/${biz.id}`}
                      className="group block"
                    >
                      <Card className="h-full hover:shadow-md hover:border-primary/30 transition-all duration-200 cursor-pointer">
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                              <Bot className="w-5 h-5 text-primary" />
                            </div>
                            <Badge
                              variant="outline"
                              className={`text-xs shrink-0 ${
                                biz.isActive
                                  ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {biz.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </div>
                          <CardTitle className="text-sm font-semibold mt-2 text-foreground group-hover:text-primary transition-colors">
                            {biz.name}
                          </CardTitle>
                          {biz.industry && (
                            <CardDescription className="text-xs capitalize">
                              {biz.industry.replace("_", " ")}
                              {biz.goal ? ` · ${biz.goal.replace("_", " ")}` : ""}
                            </CardDescription>
                          )}
                        </CardHeader>
                        <CardContent className="pt-0">
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>
                              Created{" "}
                              {biz.createdOn
                                ? new Date(biz.createdOn).toLocaleDateString()
                                : "—"}
                            </span>
                            <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-primary" />
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}

                  {/* Add business card */}
                  <Link href="/onboarding" className="group block">
                    <Card className="h-full border-dashed hover:border-primary/40 hover:bg-primary/5 transition-all duration-200 cursor-pointer">
                      <CardContent className="flex flex-col items-center justify-center h-full min-h-[120px] gap-2">
                        <Plus className="w-5 h-5 text-muted-foreground/50 group-hover:text-primary transition-colors" />
                        <span className="text-sm text-muted-foreground group-hover:text-primary transition-colors">
                          Add Business
                        </span>
                      </CardContent>
                    </Card>
                  </Link>
                </div>
              )}
            </section>
          );
        })}
      </main>
    </div>
  );
}
