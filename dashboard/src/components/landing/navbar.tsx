"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Menu, X, LayoutDashboard, LogIn } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

type User = {
  name: string | null;
  email: string | null;
  image: string | null;
} | null;

interface NavbarProps {
  user: User;
}

const navLinks = [
  { label: "Product", href: "#solution" },
  { label: "How it Works", href: "#how-it-works" },
  { label: "Use Cases", href: "#use-cases" },
  { label: "Features", href: "#features" },
  { label: "Pricing", href: "#pricing" },
];

export function Navbar({ user }: NavbarProps) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollTo = (href: string) => {
    setMenuOpen(false);
    const el = document.querySelector(href);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-background/80 backdrop-blur-xl border-b border-border shadow-sm"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group">
            {/* Placeholder logo mark */}
            <div className="relative w-8 h-8">
              <div className="absolute inset-0 rounded-lg bg-primary/20 group-hover:bg-primary/30 transition-colors" />
              <svg
                className="absolute inset-0 w-8 h-8"
                viewBox="0 0 32 32"
                fill="none"
              >
                <circle
                  cx="16"
                  cy="16"
                  r="6"
                  className="stroke-primary"
                  strokeWidth="2"
                />
                <path
                  d="M16 4 L16 10 M16 22 L16 28 M4 16 L10 16 M22 16 L28 16"
                  className="stroke-primary animate-pulse-glow"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <span className="text-lg font-bold tracking-tight text-foreground">
              Minerva
            </span>
          </Link>

          {/* Desktop nav links */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <button
                key={link.href}
                onClick={() => scrollTo(link.href)}
                className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground rounded-md hover:bg-accent transition-colors"
              >
                {link.label}
              </button>
            ))}
          </div>

          {/* Auth actions */}
          <div className="hidden md:flex items-center gap-2">
            <ThemeToggle />
            {user ? (
              <>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/50 border border-border">
                  {user.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={user.image}
                      alt={user.name ?? "Profile"}
                      className="w-6 h-6 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-primary/30 flex items-center justify-center text-xs font-semibold text-primary">
                      {(user.name?.[0] ?? user.email?.[0] ?? "U").toUpperCase()}
                    </div>
                  )}
                  <span className="text-sm font-medium text-foreground max-w-[120px] truncate">
                    {user.name ?? user.email}
                  </span>
                </div>
                <Link
                  href="/dashboard"
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  <LayoutDashboard className="w-3.5 h-3.5" />
                  Dashboard
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/auth/signin"
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-accent transition-colors"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  Sign In
                </Link>
                <Link
                  href="/auth/signin"
                  className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  Start Free Trial
                </Link>
              </>
            )}
          </div>

          {/* Mobile menu toggle */}
          <button
            className="md:hidden p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
          >
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden bg-background/95 backdrop-blur-xl border-b border-border">
          <div className="px-4 py-4 flex flex-col gap-1">
            {navLinks.map((link) => (
              <button
                key={link.href}
                onClick={() => scrollTo(link.href)}
                className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground rounded-md hover:bg-accent text-left transition-colors"
              >
                {link.label}
              </button>
            ))}
            <div className="mt-3 pt-3 border-t border-border flex flex-col gap-2">
                <div className="flex justify-end"><ThemeToggle /></div>
              {user ? (
                <Link
                  href="/dashboard"
                  className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
                >
                  <LayoutDashboard className="w-3.5 h-3.5" />
                  Go to Dashboard
                </Link>
              ) : (
                <>
                  <Link
                    href="/auth/signin"
                    className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg border border-border text-sm font-medium"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    Sign In
                  </Link>
                  <Link
                    href="/auth/signin"
                    className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium text-center"
                  >
                    Start Free Trial
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
