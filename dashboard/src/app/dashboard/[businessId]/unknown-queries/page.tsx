import { auth } from "@/auth";
import { db } from "@/db";
import { getBusinessSchema } from "@/db/business-schema";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { HelpCircle, CheckCircle2, MessageSquare, Clock } from "lucide-react";

export default async function UnknownQueriesPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin");

  const { businessId } = await params;

  const t = getBusinessSchema(businessId);

  const queries = await db
    .select()
    .from(t.unknownQueries)
    .orderBy(desc(t.unknownQueries.createdOn));

  async function resolveQuery(formData: FormData) {
    "use server";
    const session = await auth();
    if (!session?.user?.id) return;

    const queryId = formData.get("queryId") as string;
    if (!queryId) return;

    const bt = getBusinessSchema(businessId);

    await db
      .update(bt.unknownQueries)
      .set({
        resolved: true,
        resolvedBy: session.user.id,
        lastUpdatedBy: session.user.id,
        lastUpdatedOn: new Date(),
      })
      .where(eq(bt.unknownQueries.id, queryId));

    revalidatePath(`/dashboard/${businessId}/unknown-queries`);
  }

  const pendingCount = queries.filter((q) => !q.resolved).length;
  const resolvedCount = queries.length - pendingCount;

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <HelpCircle className="w-6 h-6 text-amber-500" />
            Unknown Queries
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Review and resolve queries that the AI could not answer.
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-border/60 bg-card/40 backdrop-blur shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Queries
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{queries.length}</div>
          </CardContent>
        </Card>
        <Card className="border-amber-500/30 bg-amber-500/5 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-amber-600 dark:text-amber-400">
              Needs Review
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-amber-600 dark:text-amber-400">
              {pendingCount}
            </div>
          </CardContent>
        </Card>
        <Card className="border-emerald-500/30 bg-emerald-500/5 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
              Resolved
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
              {resolvedCount}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Table */}
      <Card className="shadow-sm border-border">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="text-base">All Logs</CardTitle>
            <CardDescription>
              A list of user queries that resulted in a fallback response. Add the relevant knowledge and mark them as resolved.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {queries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-4">
                <CheckCircle2 className="w-8 h-8 text-emerald-500" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">
                You're all caught up!
              </h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                There are no unknown queries reported. Your AI knowledge base is covering all user questions effectively.
              </p>
            </div>
          ) : (
            <div className="rounded-md border border-border/50">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="w-[400px]">Query</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {queries.map((query) => (
                    <TableRow key={query.id} className="group transition-colors">
                      <TableCell>
                        <div className="flex items-start gap-3">
                          <MessageSquare className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                          <div className="font-medium text-foreground max-w-md break-words leading-relaxed text-sm">
                            {query.queryText}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {query.resolved ? (
                          <Badge
                            variant="outline"
                            className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 gap-1.5 whitespace-nowrap"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            Resolved
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="bg-amber-500/10 text-amber-600 border-amber-500/30 gap-1.5 whitespace-nowrap"
                          >
                            <Clock className="w-3 h-3" />
                            Needs Review
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                        {query.createdOn
                          ? new Date(query.createdOn).toLocaleString(undefined, {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })
                          : "Unknown"}
                      </TableCell>
                      <TableCell className="text-right">
                        {!query.resolved && (
                          <form action={resolveQuery}>
                            <input type="hidden" name="queryId" value={query.id} />
                            <Button
                              type="submit"
                              size="sm"
                              variant="outline"
                              className="text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 gap-1.5 h-8 opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Mark Resolved
                            </Button>
                          </form>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
