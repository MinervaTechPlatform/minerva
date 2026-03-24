"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  FileText,
  Upload,
  Trash2,
  Loader2,
  FileUp,
  File,
  Eye,
  Zap,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

interface Document {
  id: string;
  name: string;
  filename?: string;
  fileUrl: string;
  size: number;
  mimeType: string;
  active: boolean;
  createdAt: string;
}

interface DocumentApiResponse extends Omit<Document, "name"> {
  name?: string;
  filename?: string;
}

interface IngestionJob {
  id: string;
  status: string; // initiated | in_progress | success | failed
  ecsTaskArn?: string | null;
  errorMessage?: string | null;
  chunksProcessed?: number | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdOn?: string | null;
}

const INGESTION_STALE_AFTER_MS = 5 * 60 * 1000;

function normalizeDocument(doc: DocumentApiResponse): Document {
  return {
    ...doc,
    name: doc.name ?? doc.filename ?? "Untitled document",
  };
}

function isJobStale(job: IngestionJob | null) {
  if (!job) {
    return false;
  }

  if (job.status !== "initiated" && job.status !== "in_progress") {
    return false;
  }

  if (!job.createdOn) {
    return false;
  }

  return Date.now() - new Date(job.createdOn).getTime() >= INGESTION_STALE_AFTER_MS;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function JobStatusBadge({ status }: { status: string }) {
  if (status === "success") {
    return (
      <Badge variant="outline" className="border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 gap-1.5">
        <CheckCircle2 className="w-3 h-3" />
        Completed
      </Badge>
    );
  }
  if (status === "in_progress") {
    return (
      <Badge variant="outline" className="border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/10 gap-1.5">
        <Loader2 className="w-3 h-3 animate-spin" />
        In Progress
      </Badge>
    );
  }
  if (status === "initiated") {
    return (
      <Badge variant="outline" className="border-blue-500/30 text-blue-600 dark:text-blue-400 bg-blue-500/10 gap-1.5">
        <Clock className="w-3 h-3" />
        Queued
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge variant="outline" className="border-red-500/30 text-red-600 dark:text-red-400 bg-red-500/10 gap-1.5">
        <XCircle className="w-3 h-3" />
        Failed
      </Badge>
    );
  }
  return <Badge variant="outline">{status}</Badge>;
}

export default function DocumentsPage() {
  const params = useParams();
  const businessId = params.businessId as string;
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<{ doc: Document, url: string | null } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [latestJob, setLatestJob] = useState<IngestionJob | null>(null);
  const [jobsLoading, setJobsLoading] = useState(true);

  const isLatestJobActive =
    latestJob?.status === "initiated" || latestJob?.status === "in_progress";
  const isLatestJobStale = isJobStale(latestJob);
  const isJobBlocking = isLatestJobActive && !isLatestJobStale;

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch(`/api/businesses/${businessId}/documents`);
      if (res.ok) {
        const data: DocumentApiResponse[] = await res.json();
        setDocuments(data.map(normalizeDocument));
      }
    } catch {
      toast.error("Failed to fetch documents");
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  const fetchLatestJob = useCallback(async () => {
    try {
      const res = await fetch(`/api/businesses/${businessId}/documents/ingest`);
      if (res.ok) {
        const jobs: IngestionJob[] = await res.json();
        setLatestJob(jobs.length > 0 ? jobs[0] : null);
      }
    } catch {
      // silently fail
    } finally {
      setJobsLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    fetchDocuments();
    fetchLatestJob();
  }, [fetchDocuments, fetchLatestJob]);

  // Poll every 10s while a job is active
  useEffect(() => {
    if (!isJobBlocking) return;
    const interval = setInterval(() => {
      fetchLatestJob();
      fetchDocuments();
    }, 10_000);
    return () => clearInterval(interval);
  }, [isJobBlocking, fetchLatestJob, fetchDocuments]);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (isJobBlocking) {
      toast.error("Cannot upload documents while an ingestion job is in progress.");
      return;
    }

    const allowedTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];

    setUploading(true);

    for (const file of Array.from(files)) {
      if (!allowedTypes.includes(file.type)) {
        toast.error(`${file.name}: Only PDF, DOC, DOCX allowed`);
        continue;
      }

      try {
        // Step 1: Get presigned URL
        const res = await fetch(`/api/businesses/${businessId}/documents`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          toast.error(data.error || `Failed to upload ${file.name}`);
          continue;
        }

        // Step 2: Upload to S3
        const uploadRes = await fetch(data.uploadUrl, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type },
        });

        if (!uploadRes.ok) {
          toast.error(`Failed to upload ${file.name} to storage`);
          continue;
        }

        // Step 3: Confirm upload
        const confirmRes = await fetch(`/api/businesses/${businessId}/documents`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileKey: data.fileKey,
            fileUrl: data.fileUrl,
            fileName: data.fileName,
            fileSize: data.fileSize,
            mimeType: data.mimeType,
          }),
        });

        if (confirmRes.ok) {
          toast.success(`${file.name} uploaded successfully`);
        } else {
          toast.error(`Failed to save ${file.name}`);
        }
      } catch {
        toast.error(`Failed to upload ${file.name}`);
      }
    }

    setUploading(false);
    setDialogOpen(false);
    fetchDocuments();
  };

  const handleIngest = async () => {
    if (isJobBlocking) return;
    setIngesting(true);
    try {
      const res = await fetch(`/api/businesses/${businessId}/documents/ingest`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("Ingestion job started successfully!");
        fetchLatestJob();
      } else {
        toast.error(data.error || "Failed to start ingestion");
      }
    } catch {
      toast.error("Failed to start ingestion");
    } finally {
      setIngesting(false);
    }
  };

  const handleDelete = async (docId: string) => {
    try {
      const res = await fetch(
        `/api/businesses/${businessId}/documents?documentId=${docId}`,
        { method: "DELETE" }
      );

      if (res.ok) {
        toast.success("Document deleted");
        fetchDocuments();
      } else {
        toast.error("Failed to delete document");
      }
    } catch {
      toast.error("Failed to delete document");
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleUpload(e.dataTransfer.files);
  };

  const totalSize = documents.reduce((acc, d) => acc + d.size, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Documents</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Upload and manage your knowledge base documents
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger
            render={
              <Button
                className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
                disabled={isJobBlocking || uploading}
              />
            }
          >
            <Upload className="w-4 h-4 mr-2" />
            Upload Documents
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload Documents</DialogTitle>
              <DialogDescription>
                Upload PDF, DOC, or DOCX files. They will be processed and added
                to your knowledge base.
              </DialogDescription>
            </DialogHeader>
            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                dragOver
                  ? "border-primary bg-primary/5"
                  : "border-border bg-muted/30"
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              <FileUp className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-foreground mb-1">
                Drag &amp; drop files here, or
              </p>
              <label className="cursor-pointer">
                <span className="text-sm text-primary hover:text-primary/80 font-medium">
                  browse files
                </span>
                <input
                  type="file"
                  className="hidden"
                  multiple
                  accept=".pdf,.doc,.docx"
                  onChange={(e) => handleUpload(e.target.files)}
                  disabled={uploading}
                />
              </label>
              <p className="text-xs text-muted-foreground mt-2">
                PDF, DOC, DOCX • Max 100 MB total (trial)
              </p>
            </div>
            {uploading && (
              <div className="flex items-center justify-center gap-2 py-2">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Uploading...</span>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* Storage indicator */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Storage: {formatSize(totalSize)} / 100 MB
            </span>
            <span className="text-muted-foreground">
              {documents.length} document(s)
            </span>
          </div>
          <div className="w-full bg-muted rounded-full h-2 mt-2">
            <div
              className="bg-primary h-2 rounded-full transition-all duration-300"
              style={{
                width: `${Math.min(
                  (totalSize / (100 * 1024 * 1024)) * 100,
                  100
                )}%`,
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Ingestion Status Banner */}
      {!jobsLoading && latestJob && (
        <Card className={`border ${
          isLatestJobActive
            ? "border-amber-500/30 bg-amber-500/5"
            : latestJob.status === "success"
            ? "border-emerald-500/30 bg-emerald-500/5"
            : latestJob.status === "failed"
            ? "border-red-500/30 bg-red-500/5"
            : "border-border"
        }`}>
          <CardContent className="py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5">
                  {isLatestJobActive ? (
                    <Loader2 className="w-5 h-5 text-amber-500 animate-spin" />
                  ) : latestJob.status === "success" ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  ) : latestJob.status === "failed" ? (
                    <XCircle className="w-5 h-5 text-red-500" />
                  ) : (
                    <Clock className="w-5 h-5 text-blue-500" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-foreground">
                      Last Ingestion Job
                    </span>
                    <JobStatusBadge status={latestJob.status} />
                  </div>
                  {isJobBlocking && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      Document uploads and new ingestion jobs are locked until this job completes.
                    </p>
                  )}
                  {isLatestJobStale && (
                    <p className="text-xs text-red-600 dark:text-red-400">
                      This ingestion has been idle for more than 5 minutes. You can retry now, and the last job will be marked failed automatically.
                    </p>
                  )}
                  {latestJob.status === "success" && latestJob.chunksProcessed != null && (
                    <p className="text-xs text-muted-foreground">
                      {latestJob.chunksProcessed} chunk{latestJob.chunksProcessed !== 1 ? "s" : ""} processed
                      {latestJob.completedAt ? ` · completed ${new Date(latestJob.completedAt).toLocaleString()}` : ""}
                    </p>
                  )}
                  {latestJob.status === "failed" && latestJob.errorMessage && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                      Error: {latestJob.errorMessage}
                    </p>
                  )}
                  {latestJob.createdOn && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Started: {new Date(latestJob.createdOn).toLocaleString()}
                    </p>
                  )}
                  {(latestJob.ecsTaskArn || latestJob.id) && (
                    <details className="mt-3 rounded-md border border-border/60 bg-background/60 px-3 py-2">
                      <summary className="cursor-pointer text-xs font-medium text-muted-foreground select-none">
                        More info
                      </summary>
                      <div className="mt-2 space-y-2 text-xs">
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground/80">
                            Ingestion Job ID
                          </p>
                          <p className="break-all font-mono text-foreground">
                            {latestJob.id}
                          </p>
                        </div>
                        {latestJob.ecsTaskArn && (
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground/80">
                              ECS Task ARN
                            </p>
                            <p className="break-all font-mono text-foreground">
                              {latestJob.ecsTaskArn}
                            </p>
                          </div>
                        )}
                      </div>
                    </details>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {isLatestJobStale && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-red-500/30 text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                    onClick={handleIngest}
                    disabled={ingesting || documents.length === 0}
                  >
                    {ingesting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Retrying...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4" />
                        Retry
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Documents table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="text-base">All Documents</CardTitle>
            <CardDescription>
              Manage your uploaded documents and their processing status
            </CardDescription>
          </div>
          <Button
            onClick={handleIngest}
            disabled={isLatestJobActive || ingesting || documents.length === 0}
            className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white shadow-sm gap-2"
            size="sm"
          >
            {ingesting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Starting...
              </>
            ) : isJobBlocking ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Ingesting...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                Ingest Documents
              </>
            )}
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-12">
              <File className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground font-medium">
                No documents yet
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Upload your first document to get started
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-blue-500 dark:text-blue-400 shrink-0" />
                        <span className="font-medium text-foreground truncate max-w-[200px]">
                          {doc.name}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatSize(doc.size)}
                    </TableCell>
                    <TableCell>
                      {latestJob ? (
                        <JobStatusBadge status={latestJob.status} />
                      ) : (
                        <Badge variant="outline" className="text-xs text-muted-foreground">Not ingested</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(doc.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-primary"
                          onClick={async () => {
                            if (doc.mimeType !== "application/pdf") {
                              setPreviewDoc({ doc, url: null });
                              return;
                            }
                            
                            try {
                              const res = await fetch(`/api/businesses/${businessId}/documents/${doc.id}/url`);
                              const data = await res.json();
                              
                              if (!res.ok) {
                                throw new Error(data.error || "Failed to load preview");
                              }
                              
                              setPreviewDoc({ doc, url: data.url });
                            } catch (err: unknown) {
                              console.error("Preview error:", err);
                              const message =
                                err instanceof Error
                                  ? err.message
                                  : "Could not load document preview";
                              toast.error(message);
                            }
                          }}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          disabled={isJobBlocking}
                          onClick={() => setDeleteTarget({ id: doc.id, name: doc.name })}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete Document"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={async () => { if (deleteTarget) await handleDelete(deleteTarget.id); }}
      />

      {/* Preview Dialog */}
      <Dialog open={!!previewDoc} onOpenChange={(open) => !open && setPreviewDoc(null)}>
        <DialogContent className="!w-[90vw] !max-w-[90vw] !h-[90vh] !max-h-[90vh] flex flex-col p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 pr-8">
              <FileText className="w-4 h-4 text-blue-500 dark:text-blue-400 shrink-0" />
              <span className="truncate">{previewDoc?.doc.name}</span>
            </DialogTitle>
            <DialogDescription>
              {previewDoc && formatSize(previewDoc.doc.size)} • {previewDoc?.doc.mimeType === "application/pdf" ? "PDF" : "Document"}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 rounded-lg overflow-hidden border border-border bg-muted/30">
            {previewDoc?.url && previewDoc?.doc.mimeType === "application/pdf" ? (
              <iframe
                src={previewDoc.url}
                className="h-full w-full border-0 bg-white"
                title={`Preview: ${previewDoc.doc.name}`}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-[40vh] text-center p-6">
                <File className="w-12 h-12 text-muted-foreground/30 mb-3" />
                <p className="text-sm font-medium text-foreground">
                  Preview not available for this format
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  DOC/DOCX files cannot be previewed in the browser.
                  Download to view.
                </p>
                <a
                  href={previewDoc?.doc.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  Download File
                </a>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
