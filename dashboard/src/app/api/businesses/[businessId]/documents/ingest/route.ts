import { auth } from "@/auth";
import { db } from "@/db";
import { businesses } from "@/db/schema";
import { getTenantSchema } from "@/db/tenant-schema";
import { eq, and, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ECSClient, RunTaskCommand } from "@aws-sdk/client-ecs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ businessId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { businessId } = await params;

  // Verify ownership
  const [business] = await db
    .select()
    .from(businesses)
    .where(and(eq(businesses.id, businessId), eq(businesses.isActive, true)));

  if (!business) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const t = getTenantSchema(business.orgId);

  // 1. Check if there is already an in-progress job for this business
  const activeJobs = await db
    .select()
    .from(t.ingestionJobs)
    .where(
      and(
        eq(t.ingestionJobs.businessId, businessId),
        inArray(t.ingestionJobs.status, ["initiated", "in_progress"])
      )
    );

  if (activeJobs.length > 0) {
    return NextResponse.json(
      { error: "An ingestion job is already in progress. Please wait for it to complete." },
      { status: 409 }
    );
  }

  // 2. Collect all document IDs for this business that are in "initiated" state
  const docs = await db
    .select({ id: t.documents.id })
    .from(t.documents)
    .where(eq(t.documents.isActive, true));

  if (docs.length === 0) {
    return NextResponse.json(
      { error: "No documents to ingest." },
      { status: 400 }
    );
  }

  // 3. Create the ingestion job record
  const [job] = await db
    .insert(t.ingestionJobs)
    .values({
      businessId,
      documentIds: docs.map((d) => d.id),
      status: "initiated",
      createdBy: session.user.id,
    })
    .returning();

  // 4. Trigger ECS Task with environment overrides
  try {
    const ecsClient = new ECSClient({ region: process.env.AWS_REGION });
    const command = new RunTaskCommand({
      cluster: process.env.ECS_CLUSTER_NAME,
      taskDefinition: process.env.INGESTION_TASK_DEF_ARN,
      launchType: "FARGATE",
      networkConfiguration: {
        awsvpcConfiguration: {
          subnets: (process.env.PRIVATE_SUBNET_IDS || "").split(","),
          securityGroups: process.env.ECS_SECURITY_GROUP_ID
            ? [process.env.ECS_SECURITY_GROUP_ID]
            : [],
          assignPublicIp: "DISABLED",
        },
      },
      overrides: {
        containerOverrides: [
          {
            name: "ingestion",
            environment: [
              { name: "INGESTION_JOB_ID", value: job.id },
              { name: "TENANT_SCHEMA", value: business.schemaName },
            ],
          },
        ],
      },
    });

    await ecsClient.send(command);
  } catch (err) {
    console.error("[ingest] Failed to trigger ECS task:", err);
    // Mark job as failed if we couldn't trigger ECS
    await db
      .update(t.ingestionJobs)
      .set({
        status: "failed",
        errorMessage: `Failed to trigger ECS task: ${err instanceof Error ? err.message : String(err)}`,
      })
      .where(eq(t.ingestionJobs.id, job.id));

    return NextResponse.json(
      { error: "Failed to trigger ingestion task. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ job }, { status: 201 });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ businessId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { businessId } = await params;

  // Verify ownership
  const [business] = await db
    .select()
    .from(businesses)
    .where(and(eq(businesses.id, businessId), eq(businesses.isActive, true)));

  if (!business) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const t = getTenantSchema(business.orgId);

  // Return up to 5 most recent jobs for this business
  const jobs = await db
    .select()
    .from(t.ingestionJobs)
    .where(eq(t.ingestionJobs.businessId, businessId))
    .orderBy(t.ingestionJobs.createdOn)
    .limit(5);

  // Return in descending order (most recent first)
  return NextResponse.json(jobs.reverse());
}
