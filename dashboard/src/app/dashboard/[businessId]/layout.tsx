import { auth } from "@/auth";
import { db } from "@/db";
import { businesses, orgMembers, organizations } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { SidebarNav } from "@/components/sidebar-nav";
import { signOut } from "@/auth";

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ businessId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin");

  const { businessId } = await params;

  // Fetch all orgs this user belongs to
  const memberships = await db
    .select({
      orgId: orgMembers.orgId,
      orgName: organizations.name,
      orgPlan: organizations.plan,
    })
    .from(orgMembers)
    .innerJoin(organizations, eq(orgMembers.orgId, organizations.id))
    .where(eq(orgMembers.userId, session.user.id));

  const orgs = memberships.map((m) => ({
    id: m.orgId,
    name: m.orgName,
    plan: m.orgPlan,
  }));

  const orgIds = orgs.map((o) => o.id);

  const userBusinesses =
    orgIds.length > 0
      ? await db
          .select()
          .from(businesses)
          .where(inArray(businesses.orgId, orgIds))
      : [];

  if (userBusinesses.length === 0) redirect("/onboarding");

  const currentBusiness = userBusinesses.find((b) => b.id === businessId);
  if (!currentBusiness) redirect(`/dashboard/${userBusinesses[0].id}`);

  // Derive plan from the current business's org
  const currentOrg = orgs.find((o) => o.id === currentBusiness.orgId);
  const plan = currentOrg?.plan ?? "trial";

  // Server action for sign-out (keeps auth logic server-side)
  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/auth/signin" });
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-[240px] bg-sidebar border-r border-sidebar-border flex flex-col shrink-0">
        <SidebarNav
          businessId={businessId}
          businesses={userBusinesses}
          orgs={orgs}
          plan={plan}
          user={{
            id: session.user.id,
            name: session.user.name,
            email: session.user.email,
            image: session.user.image,
          }}
          onSignOut={handleSignOut}
        />
      </aside>

      {/* Main content — no top bar needed, it's all in the sidebar */}
      <main className="flex-1 p-6 overflow-auto min-w-0">
        {children}
      </main>
    </div>
  );
}
