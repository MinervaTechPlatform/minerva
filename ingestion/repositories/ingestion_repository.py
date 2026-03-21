"""
ingestion/repositories/ingestion_repository.py — Data access for Ingestion Service.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional, Any
from shared.db.connection import get_connection
from shared.models.ingestion_job import IngestionJob, IngestionStatus
from shared.models.document import Document

class IngestionRepository:
    """Encapsulates SQL logic for ingestion jobs and documents."""

    def __init__(self, schema_name: str):
        self.schema_name = schema_name

    async def create_job(self, document_id: uuid.UUID) -> IngestionJob:
        """Create a new ingestion job record."""
        job_id = uuid.uuid4()
        async with get_connection(self.schema_name) as conn:
            await conn.execute(
                """
                INSERT INTO ingestion_jobs (id, document_ids, status, created_on, last_updated_on)
                VALUES ($1, $2, $3, $4, $5)
                """,
                job_id, [document_id], IngestionStatus.INITIATED, datetime.now(timezone.utc), datetime.now(timezone.utc)
            )
            # Fetch the newly created job
            row = await conn.fetchrow("SELECT * FROM ingestion_jobs WHERE id = $1", job_id)
            return IngestionJob.from_record(dict(row))

    async def get_job_and_document(self, job_id: uuid.UUID) -> tuple[Optional[IngestionJob], Optional[Document], Optional[uuid.UUID]]:
        """Load job, trigger document, and business ID."""
        async with get_connection(self.schema_name) as conn:
            job_row = await conn.fetchrow("SELECT * FROM ingestion_jobs WHERE id = $1", job_id)
            if not job_row:
                return None, None, None
            
            job = IngestionJob.from_record(dict(job_row))
            
            doc_row = await conn.fetchrow("SELECT * FROM documents WHERE id = $1", job.trigger_document_id)
            document = Document.from_record(dict(doc_row)) if doc_row else None
            
            biz_row = await conn.fetchrow("SELECT id FROM public.businesses WHERE schema_name = $1", self.schema_name)
            business_id = biz_row["id"] if biz_row else None
            
            return job, document, business_id

    async def update_job_status(
        self,
        job_id: uuid.UUID,
        status: IngestionStatus,
        error_message: Optional[str] = None,
        chunks_processed: Optional[int] = None,
        started_at: Optional[datetime] = None,
        completed_at: Optional[datetime] = None
    ) -> None:
        fields = ["status = $2", "last_updated_on = $3"]
        values = [job_id, status, datetime.now(timezone.utc)]
        
        idx = 4
        if error_message is not None:
            fields.append(f"error_message = ${idx}")
            values.append(error_message)
            idx += 1
        if chunks_processed is not None:
            fields.append(f"chunks_processed = ${idx}")
            values.append(chunks_processed)
            idx += 1
        if started_at is not None:
            fields.append(f"started_at = ${idx}")
            values.append(started_at)
            idx += 1
        if completed_at is not None:
            fields.append(f"completed_at = ${idx}")
            values.append(completed_at)
            idx += 1
            
        sql = f"UPDATE ingestion_jobs SET {', '.join(fields)} WHERE id = $1"
        async with get_connection(self.schema_name) as conn:
            await conn.execute(sql, *values)

    async def update_document(self, doc_id: uuid.UUID, chunk_count: int, embedding_model: str) -> None:
        async with get_connection(self.schema_name) as conn:
            # 1. Update current document
            await conn.execute(
                """
                UPDATE documents 
                SET chunk_count = $2, embedding_model = $3, last_updated_on = $4, is_active = true
                WHERE id = $1
                """,
                doc_id, chunk_count, embedding_model, datetime.now(timezone.utc)
            )
            
            # 2. Deactivate other versions of the same filename
            await conn.execute(
                """
                UPDATE documents 
                SET is_active = false 
                WHERE filename = (SELECT filename FROM documents WHERE id = $1)
                  AND id != $1
                """,
                doc_id
            )

    async def update_job_documents(self, job_id: uuid.UUID, doc_ids: list[uuid.UUID]) -> None:
        async with get_connection(self.schema_name) as conn:
            await conn.execute(
                "UPDATE ingestion_jobs SET document_ids = $2 WHERE id = $1",
                job_id, doc_ids
            )

    async def get_active_documents_except(self, exclude_doc_id: uuid.UUID) -> list[Document]:
        async with get_connection(self.schema_name) as conn:
            rows = await conn.fetch(
                "SELECT * FROM documents WHERE is_active = true AND id != $1",
                exclude_doc_id
            )
            return [Document.from_record(dict(r)) for r in rows]

    async def notify_index_update(self, business_id: uuid.UUID) -> None:
        async with get_connection(self.schema_name) as conn:
             await conn.execute(f"NOTIFY index_updates, '{str(business_id)}'")
