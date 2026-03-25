import { auth } from "@/auth";
import { db } from "@/db";
import { businesses } from "@/db/schema";
import { getBusinessSchema } from "@/db/business-schema";
import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client, S3_BUCKET } from "@/lib/s3";

function getS3KeyFromStoragePath(storagePath: string) {
  const prefix = `s3://${S3_BUCKET}/`;
  if (!storagePath.startsWith(prefix)) {
    throw new Error(`Invalid storage path for bucket ${S3_BUCKET}: ${storagePath}`);
  }
  return storagePath.slice(prefix.length);
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ businessId: string; documentId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { businessId, documentId } = await params;

    // Verify ownership
    const [business] = await db
      .select()
      .from(businesses)
      .where(
        and(eq(businesses.id, businessId), eq(businesses.isActive, true))
      );

    if (!business) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Get document metadata
    const { documents } = getBusinessSchema(businessId);
    const [doc] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, documentId));

    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    // Generate short-lived presigned GET URL (expires in 15 minutes)
    const command = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: getS3KeyFromStoragePath(doc.storagePath),
      ResponseContentType: doc.mimeType ?? undefined,
      ResponseContentDisposition: "inline",
    });

    const viewUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 900,
    });

    return NextResponse.json({ url: viewUrl });
  } catch (error) {
    console.error("Error generating view URL:", error);
    return NextResponse.json(
      { error: "Failed to generate view URL" },
      { status: 500 }
    );
  }
}
