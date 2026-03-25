import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      /**
       * The org the user last visited / selected.
       * Populated in auth.ts session callback from org_members.
       * Update this when the user switches orgs.
       */
      activeOrgId: string | null;
    } & DefaultSession["user"];
  }
}
