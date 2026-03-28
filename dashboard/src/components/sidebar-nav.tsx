"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FileText,
  MessageSquare,
  BarChart3,
  Settings,
  Bot,
  Crown,
  Zap,
  Check,
  ChevronsUpDown,
  Plus,
  Building2,
  Sun,
  Moon,
  LogOut,
  LayoutGrid,
  HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useTheme } from "next-themes";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Business {
  id: string;
  name: string;
  orgId: string;
  industry: string | null;
  isActive: boolean;
}

interface Org {
  id: string;
  name: string;
  plan: string;
}

interface User {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

interface SidebarNavProps {
  businessId: string;
  businesses: Business[];   // all businesses across all user's orgs
  orgs: Org[];              // all orgs user belongs to
  plan: string;             // plan of current business's org
  user: User;
  onSignOut: () => Promise<void>;
}

// ─── Nav items ───────────────────────────────────────────────────────────────

const navItems = [
  { title: "Overview",  href: "",           icon: LayoutDashboard },
  { title: "Documents", href: "/documents", icon: FileText        },
  { title: "Testing",   href: "/testing",   icon: MessageSquare   },
  { title: "Usage",     href: "/usage",     icon: BarChart3       },
  { title: "Unknown Queries", href: "/unknown-queries", icon: HelpCircle },
  { title: "Settings",  href: "/settings",  icon: Settings        },
];

// ─── Component ───────────────────────────────────────────────────────────────

export function SidebarNav({
  businessId,
  businesses,
  orgs,
  plan,
  user,
  onSignOut,
}: SidebarNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();

  const [switcherOpen, setSwitcherOpen] = useState(false);
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const basePath = `/dashboard/${businessId}`;
  const currentBusiness = businesses.find((b) => b.id === businessId);
  const currentOrg = orgs.find((o) => o.id === currentBusiness?.orgId);

  // Group businesses by org for the switcher
  const businessesByOrg: Record<string, Business[]> = {};
  for (const b of businesses) {
    if (!businessesByOrg[b.orgId]) businessesByOrg[b.orgId] = [];
    businessesByOrg[b.orgId].push(b);
  }

  return (
    <div className="flex flex-col h-full">

      {/* ── Logo ─────────────────────────────────────────────────────────── */}
      <div className="px-4 pt-4 pb-2">
        <Link href="/dashboard" className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-md shadow-emerald-900/40 shrink-0">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-foreground text-lg">Minerva</span>
        </Link>

        {/* Org label */}
        {currentOrg && (
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 px-1 mb-1">
            {currentOrg.name}
          </p>
        )}

        {/* Business Switcher */}
        <Popover open={switcherOpen} onOpenChange={setSwitcherOpen}>
          <PopoverTrigger
            render={
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={switcherOpen}
                className="w-full justify-between bg-sidebar-accent/50 border-sidebar-border hover:bg-sidebar-accent text-sm"
              />
            }
          >
            <div className="flex items-center gap-2 truncate">
              <Building2 className="h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="truncate text-foreground">
                {currentBusiness?.name || "Select business"}
              </span>
            </div>
            <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-40" />
          </PopoverTrigger>

          <PopoverContent className="w-[220px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search businesses..." />
              <CommandList>
                <CommandEmpty>No businesses found.</CommandEmpty>

                {/* Grouped by org */}
                {orgs.map((org) => {
                  const orgBizs = businessesByOrg[org.id] ?? [];
                  if (orgBizs.length === 0) return null;
                  return (
                    <CommandGroup key={org.id} heading={org.name}>
                      {orgBizs.map((biz) => (
                        <CommandItem
                          key={biz.id}
                          value={`${org.name} ${biz.name}`}
                          onSelect={() => {
                            router.push(`/dashboard/${biz.id}`);
                            setSwitcherOpen(false);
                          }}
                        >
                          <Building2 className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                          <span className="truncate">{biz.name}</span>
                          <Check
                            className={cn(
                              "ml-auto h-3.5 w-3.5 text-primary",
                              biz.id === businessId ? "opacity-100" : "opacity-0"
                            )}
                          />
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  );
                })}

                <CommandSeparator />

                {/* Add business — check plan */}
                {plan !== "trial" ? (
                  <CommandGroup>
                    <CommandItem
                      onSelect={() => {
                        router.push("/onboarding");
                        setSwitcherOpen(false);
                      }}
                    >
                      <Plus className="mr-2 h-3.5 w-3.5" />
                      New Business
                    </CommandItem>
                  </CommandGroup>
                ) : (
                  <CommandGroup heading="Trial Plan">
                    <CommandItem
                      onSelect={() => {
                        router.push(`/dashboard/upgrade`);
                        setSwitcherOpen(false);
                      }}
                      className="text-primary"
                    >
                      <Zap className="mr-2 h-3.5 w-3.5" />
                      Upgrade to add more
                    </CommandItem>
                  </CommandGroup>
                )}

                {/* Dashboard link */}
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    onSelect={() => {
                      router.push("/dashboard");
                      setSwitcherOpen(false);
                    }}
                  >
                    <LayoutGrid className="mr-2 h-3.5 w-3.5" />
                    All businesses
                  </CommandItem>
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {/* ── Navigation ───────────────────────────────────────────────────── */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const fullHref = basePath + item.href;
          const isActive =
            item.href === ""
              ? pathname === basePath
              : pathname.startsWith(fullHref);

          return (
            <Link
              key={item.title}
              href={fullHref}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
                isActive
                  ? "bg-emerald-500/15 text-emerald-400"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <item.icon
                className={cn(
                  "w-4 h-4 shrink-0",
                  isActive ? "text-emerald-400" : "text-muted-foreground"
                )}
              />
              {item.title}
            </Link>
          );
        })}
      </nav>

      {/* ── Bottom section ───────────────────────────────────────────────── */}
      <div className="p-3 border-t border-sidebar-border space-y-1">

        {/* Upgrade CTA */}
        {plan === "trial" ? (
          <button
            onClick={() => router.push(`/dashboard/upgrade`)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-primary/10 hover:bg-primary/15 border border-primary/20 transition-all duration-150 group cursor-pointer"
          >
            <Zap className="w-4 h-4 text-primary shrink-0 group-hover:scale-110 transition-transform" />
            <div className="flex-1 text-left min-w-0">
              <p className="text-xs font-semibold text-primary">Upgrade to Pro</p>
              <p className="text-xs text-muted-foreground truncate">Unlock all features</p>
            </div>
          </button>
        ) : (
          <div className="flex items-center gap-3 px-3 py-2">
            <Crown className="w-4 h-4 text-amber-500 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-foreground">Pro Plan</p>
              <p className="text-xs text-muted-foreground">All features active</p>
            </div>
          </div>
        )}

        {/* Theme + Profile row */}
        <div className="flex items-center justify-between px-1 pt-1">
          {/* Profile dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger className="focus:outline-none flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent transition-colors min-w-0 flex-1 mr-1">
              <Avatar className="w-6 h-6 border border-border shrink-0">
                <AvatarImage src={user.image || ""} />
                <AvatarFallback className="bg-primary/15 text-primary text-[10px]">
                  {user.name?.charAt(0) || "U"}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs font-medium text-foreground truncate">
                {user.name || user.email || "Account"}
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="w-52 mb-1">
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium text-foreground">{user.name}</p>
                <p className="text-xs text-muted-foreground">{user.email}</p>
              </div>
              <DropdownMenuSeparator />
              <form action={onSignOut}>
                <DropdownMenuItem
                  render={<button type="submit" className="w-full cursor-pointer" />}
                >
                  <LogOut className="w-4 h-4" />
                  Sign out
                </DropdownMenuItem>
              </form>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Theme toggle */}
          <Button
            variant="ghost"
            size="icon-sm"
            className="shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          >
            {mounted && resolvedTheme === "dark" ? (
              <Sun className="w-4 h-4" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
            <span className="sr-only">Toggle theme</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
