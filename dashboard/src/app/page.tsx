import { auth } from "@/auth";
import { LandingPage } from "@/components/landing/landing-page";

export const metadata = {
  title: "Minerva — Conversations that Convert",
  description:
    "Minerva is a next-generation AI conversation engine designed to turn every customer interaction into a meaningful, high-conversion experience.",
};

/**
 * Root page: always renders the public landing page.
 * If the user is signed in, the navbar shows profile + Go to Dashboard.
 * If not, it shows a Sign In button.
 */
export default async function HomePage() {
  const session = await auth();
  const user = session?.user ?? null;

  return (
    <LandingPage
      user={user ? { name: user.name ?? null, email: user.email ?? null, image: user.image ?? null } : null}
    />
  );
}
