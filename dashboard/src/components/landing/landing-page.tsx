"use client";

import { Navbar } from "./navbar";
import { HeroSection } from "./hero-section";
import { ProblemSection } from "./problem-section";
import { SolutionSection } from "./solution-section";
import { HowItWorksSection } from "./how-it-works-section";
import { UseCasesSection } from "./use-cases-section";
import { FeaturesSection } from "./features-section";
import { PricingSection } from "./pricing-section";
import { ComparisonSection } from "./comparison-section";
import { PlatformSection } from "./platform-section";
import { SocialProofSection, CtaSection } from "./cta-section";
import { Footer } from "./footer";

type User = {
  name: string | null;
  email: string | null;
  image: string | null;
} | null;

interface LandingPageProps {
  user: User;
}

export function LandingPage({ user }: LandingPageProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar user={user} />
      <main>
        <HeroSection />
        <ProblemSection />
        <SolutionSection />
        <HowItWorksSection />
        <UseCasesSection />
        <FeaturesSection />
        <PricingSection />
        <ComparisonSection />
        <PlatformSection />
        <SocialProofSection />
        <CtaSection />
      </main>
      <Footer />
    </div>
  );
}
