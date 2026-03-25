import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/db";
import { users, accounts, sessions, verificationTokens, orgMembers } from "@/db/schema";
import { eq } from "drizzle-orm";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [Google],
  pages: {
    signIn: "/auth/signin",
  },
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;

        // Populate activeOrgId: the first org this user belongs to.
        // On the frontend, users can switch org by hitting PATCH /api/users/me/active-org
        // and storing the preferred orgId in a cookie; this is the fallback.
        const [firstMembership] = await db
          .select({ orgId: orgMembers.orgId })
          .from(orgMembers)
          .where(eq(orgMembers.userId, user.id))
          .limit(1);

        session.user.activeOrgId = firstMembership?.orgId ?? null;
      }
      return session;
    },
  },
});
