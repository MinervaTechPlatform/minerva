import { auth } from "@/auth";
import { db } from "@/db";
import { businesses } from "@/db/schema";
import { getBusinessSchema } from "@/db/business-schema";
import { eq, and, inArray, desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ECSClient, RunTaskCommand } from "@aws-sdk/client-ecs";

const INGESTION_STALE_AFTER_MS = 5 * 60 * 1000;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ businessId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { businessId } = await params;
  console.log("[ingest] Received ingestion trigger request", {
    businessId,
    userId: session.user.id,
  });

  // Verify ownership
  const [business] = await db
    .select()
    .from(businesses)
    .where(and(eq(businesses.id, businessId), eq(businesses.isActive, true)));

  if (!business) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const t = getBusinessSchema(businessId);
  const now = new Date();
  console.log("[ingest] Resolved business schema context", {
    businessId,
    schemaName: `bus_${businessId}`,
  });

  // 1. Check if there is already an in-progress job for this business
  const activeJobs = await db
    .select()
    .from(t.ingestionJobs)
    .where(
      inArray(t.ingestionJobs.status, ["initiated", "in_progress"])
    );
  console.log("[ingest] Checked active ingestion jobs", {
    businessId,
    activeJobCount: activeJobs.length,
  });

  const staleJobs = activeJobs.filter((job) => {
    if (!job.createdOn) {
      return false;
    }

    return now.getTime() - new Date(job.createdOn).getTime() >= INGESTION_STALE_AFTER_MS;
  });

  const blockingJobs = activeJobs.filter(
    (job) => !staleJobs.some((staleJob) => staleJob.id === job.id)
  );

  if (blockingJobs.length > 0) {
    console.warn("[ingest] Blocking ingestion because an active job already exists", {
      businessId,
      blockingJobIds: blockingJobs.map((job) => job.id),
    });
    return NextResponse.json(
      { error: "An ingestion job is already in progress. Please wait for it to complete." },
      { status: 409 }
    );
  }

  if (staleJobs.length > 0) {
    console.warn("[ingest] Marking stale ingestion jobs as failed", {
      businessId,
      staleJobIds: staleJobs.map((job) => job.id),
    });
    await db
      .update(t.ingestionJobs)
      .set({
        status: "failed",
        errorMessage:
          "Marked failed automatically because ingestion did not progress for more than 5 minutes.",
        completedAt: now,
        lastUpdatedBy: session.user.id,
        lastUpdatedOn: now,
      })
      .where(
        inArray(
          t.ingestionJobs.id,
          staleJobs.map((job) => job.id)
        )
      );
  }

  // 2. Collect all active documents for this business
  const docs = await db
    .select({ id: t.documents.id })
    .from(t.documents)
    .where(eq(t.documents.isActive, true));
  console.log("[ingest] Collected documents for ingestion job", {
    businessId,
    documentCount: docs.length,
  });

  if (docs.length === 0) {
    return NextResponse.json(
      { error: "No documents to ingest." },
      { status: 400 }
    );
  }

  // 3. Create the ingestion job record (no businessId column — schema is already scoped)
  const [job] = await db
    .insert(t.ingestionJobs)
    .values({
      documentIds: docs.map((d) => d.id),
      status: "initiated",
      createdBy: session.user.id,
      lastUpdatedBy: session.user.id,
    })
    .returning();
  console.log("[ingest] Created ingestion job", {
    businessId,
    jobId: job.id,
    documentCount: job.documentIds.length,
    status: job.status,
  });

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
              { name: "BUSINESS_SCHEMA", value: `bus_${businessId}` },
            ],
          },
        ],
      },
    });

    const ecsResponse = await ecsClient.send(command);
    const ecsTaskArn = ecsResponse.tasks?.[0]?.taskArn ?? null;
    const ecsFailures = (ecsResponse.failures ?? []).map((failure) => ({
      arn: failure.arn,
      reason: failure.reason,
      detail: failure.detail,
    }));

    console.log("[ingest] ECS RunTask completed", {
      businessId,
      jobId: job.id,
      ecsTaskArn,
      taskCount: ecsResponse.tasks?.length ?? 0,
      failureCount: ecsFailures.length,
      failures: ecsFailures,
    });

    if (ecsFailures.length > 0 && !ecsTaskArn) {
      throw new Error(
        `ECS RunTask returned failures: ${ecsFailures
          .map((failure) => failure.reason ?? failure.detail ?? failure.arn ?? "unknown")
          .join(", ")}`
      );
    }

    const [updatedJob] = await db
      .update(t.ingestionJobs)
      .set({
        ecsTaskArn,
        lastUpdatedBy: session.user.id,
        lastUpdatedOn: new Date(),
      })
      .where(eq(t.ingestionJobs.id, job.id))
      .returning();

    console.log("[ingest] Stored ECS task reference on ingestion job", {
      businessId,
      jobId: job.id,
      ecsTaskArn: updatedJob.ecsTaskArn,
    });

    return NextResponse.json({ job: updatedJob }, { status: 201 });
  } catch (err) {
    console.error("[ingest] Failed to trigger ECS task:", err);
    // Mark job as failed if we couldn't trigger ECS
    await db
      .update(t.ingestionJobs)
      .set({
        status: "failed",
        errorMessage: `Failed to trigger ECS task: ${err instanceof Error ? err.message : String(err)}`,
        completedAt: new Date(),
        ecsTaskArn: null,
        lastUpdatedBy: session.user.id,
        lastUpdatedOn: new Date(),
      })
      .where(eq(t.ingestionJobs.id, job.id));

    return NextResponse.json(
      { error: "Failed to trigger ingestion task. Please try again." },
      { status: 500 }
    );
  }
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

  const t = getBusinessSchema(businessId);

  // Return up to 5 most recent jobs for this business
  const jobs = await db
    .select()
    .from(t.ingestionJobs)
    .orderBy(
      desc(t.ingestionJobs.createdOn),
      desc(t.ingestionJobs.lastUpdatedOn),
      desc(t.ingestionJobs.id)
    )
    .limit(5);

  return NextResponse.json(jobs);
}
