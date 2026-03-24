"""
ingestion/services/ingestion_service.py — Orchestrates the full ingestion pipeline.

Purpose:
    Coordinates the end-to-end document ingestion flow.
    Abstracted via Repositories and Storage Providers for cloud-agnosticism.
"""

from __future__ import annotations

import os
import tempfile
import uuid
from datetime import datetime, timezone

import numpy as np

from ingestion.pipeline import chunker, embedder, parser, vector_store
from ingestion.repositories.ingestion_repository import IngestionRepository
from shared.exceptions.pipeline_exceptions import IngestionError
from shared.models.document import Document
from shared.models.ingestion_job import IngestionStatus
from shared.utils.logging import get_logger
from shared.storage.resolver import get_storage_provider

logger = get_logger("ingestion.services.ingestion_service")

_DEFAULT_EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "BAAI/bge-small-en-v1.5")


async def process_job(job_id: str) -> bool:
    """Run the full ingestion pipeline for a given job ID."""
    job_uuid = uuid.UUID(job_id)
    schema_name = os.environ.get("BUSINESS_SCHEMA")
    
    if not schema_name:
        logger.error("BUSINESS_SCHEMA environment variable is required.")
        return False

    repo = IngestionRepository(schema_name)
    logger.info(f"Starting ingestion for job_id={job_id}")
    temp_file: str | None = None

    try:
        # 1. Load job and trigger document
        job, document, business_id = await repo.get_job_and_document(job_uuid)
        if not job or not document:
            raise IngestionError("ingestion", f"Job or document not found for {job_id}")

        # 2. Mark in_progress
        await repo.update_job_status(job_uuid, IngestionStatus.IN_PROGRESS, started_at=datetime.now(timezone.utc))

        # 3. Download document
        temp_file = await _download_file(document.storage_path, document.filename)

        # 4. Parse
        raw_text = parser.parse(temp_file, document.file_type)

        # 5. Chunk
        chunks = chunker.chunk(raw_text)
        chunk_texts = [c["text"] for c in chunks]

        # 6. Embed current
        current_embeddings = embedder.embed(chunk_texts, model_name=_DEFAULT_EMBEDDING_MODEL)

        # 7. Collect all active chunks for business
        all_embeddings, all_metadata = await _build_combined_embeddings(
            repo, business_id, document, chunks, current_embeddings
        )

        # 8. Archive & Save Index
        await vector_store.archive_previous_index(str(business_id), job_id)
        faiss_index = vector_store.build_index(all_embeddings, all_metadata)
        await vector_store.save_index(faiss_index, all_metadata, str(business_id), job_id)

        # 9. Update DB
        await repo.update_document(document.id, len(chunks), _DEFAULT_EMBEDDING_MODEL)
        
        all_doc_ids = list({uuid.UUID(m["document_id"]) for m in all_metadata})
        await repo.update_job_documents(job_uuid, all_doc_ids)

        # 10. Mark success
        await repo.update_job_status(
            job_uuid, IngestionStatus.SUCCESS, 
            chunks_processed=len(chunks), 
            completed_at=datetime.now(timezone.utc)
        )

        # 11. Notify Core
        await repo.notify_index_update(business_id)

        return True

    except Exception as exc:
        logger.error(f"Ingestion failed for job {job_id}: {exc}", exc_info=True)
        try:
            await repo.update_job_status(
                job_uuid, IngestionStatus.FAILED, 
                error_message=str(exc), 
                completed_at=datetime.now(timezone.utc)
            )
        except:
            pass
        return False

    finally:
        if temp_file and os.path.exists(temp_file):
            os.remove(temp_file)


async def _download_file(storage_path: str, filename: str) -> str:
    """Download file via StorageProvider."""
    # Handles dynamically generated paths from storage providers like `s3://bucket/key` or `local://bucket/key`
    if "://" not in storage_path:
        raise IngestionError("download", f"Invalid path format: {storage_path}")

    # Split the protocol (e.g., s3://, local://) from the actual path
    provider_prefix, path = storage_path.split("://", 1)
    
    if "/" not in path:
        raise IngestionError("download", f"Invalid path structure (missing bucket/key): {storage_path}")
        
    bucket, key = path.split("/", 1)
    ext = os.path.splitext(filename)[1] or ".tmp"

    tmp_path = os.path.join(tempfile.gettempdir(), f"{uuid.uuid4()}{ext}")
    
    storage = get_storage_provider()
    await storage.download_file(bucket, key, tmp_path)
    return tmp_path


async def _build_combined_embeddings(
    repo: IngestionRepository,
    business_id: uuid.UUID,
    current_doc: Document,
    current_chunks: list[dict],
    current_embeddings: np.ndarray,
) -> tuple[np.ndarray, list[dict]]:
    """Build combined embeddings for all active docs via Repository."""
    all_embeddings = [current_embeddings]
    all_metadata = [
        {**c, "document_id": str(current_doc.id), "filename": current_doc.filename}
        for c in current_chunks
    ]

    others = await repo.get_active_documents_except(current_doc.id)
    for other in others:
        if not other.storage_path:
            continue
        
        logger.info(f"Re-embedding previous active document: {other.filename}")
        tmp_file = None
        try:
            tmp_file = await _download_file(other.storage_path, other.filename)
            try:
                text = parser.parse(tmp_file, other.file_type)
                chunks = chunker.chunk(text)
                if not chunks:
                    continue
                
                embs = embedder.embed([c["text"] for c in chunks], model_name=_DEFAULT_EMBEDDING_MODEL)
                all_embeddings.append(embs)
                all_metadata.extend([
                    {**c, "document_id": str(other.id), "filename": other.filename}
                    for c in chunks
                ])
            finally:
                if tmp_file and os.path.exists(tmp_file):
                    os.remove(tmp_file)
        except (FileNotFoundError, IngestionError) as e:
            logger.warning(f"Skipping document {other.filename} (ID: {other.id}) because source is missing or invalid: {e}")
            continue
        except Exception as e:
            logger.error(f"Unexpected error re-embedding {other.filename} (ID: {other.id}): {e}", exc_info=True)
            continue

    combined = np.vstack(all_embeddings).astype(np.float32)
    return combined, all_metadata
