"""FastAPI Backend Application for TypeCast - Uzbek Transliteration Platform.

Provides REST endpoints for:
- Text-to-text transliteration (Latin <-> Cyrillic)
- Document file transliteration (.docx, .doc, .txt) with format conversion options
- System health and engine capability reporting
"""

import os
import shutil
import uuid
import logging
from typing import Optional, Literal
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

from backend.app.transliterator import transliterate
from backend.app.doc_handler import process_document

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("typecast")

app = FastAPI(
    title="TypeCast - Uzbek Transliteration Platform API",
    description="High-fidelity Uzbek Latin <-> Cyrillic Transliteration & Document Processing Service",
    version="1.0.0",
)

# Enable CORS for local development and production Vercel deployments
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def cleanup_directory(dir_path: str):
    """Background task to remove temporary session directories."""
    try:
        if os.path.exists(dir_path):
            shutil.rmtree(dir_path, ignore_errors=True)
            logger.info(f"Cleaned up session directory: {dir_path}")
    except Exception as e:
        logger.error(f"Error cleaning up directory {dir_path}: {e}")


class TextTransliterateRequest(BaseModel):
    text: str = Field(..., description="Source text to transliterate")
    direction: Literal["latin-to-cyrillic", "cyrillic-to-latin"] = Field(
        default="latin-to-cyrillic",
        description="Transliteration direction"
    )


class TextTransliterateResponse(BaseModel):
    transliterated: str
    direction: str
    length: int


@app.get("/api/health")
def health_check():
    """Returns service health and detected system engines."""
    soffice_path = shutil.which("soffice") or shutil.which("libreoffice")
    return {
        "status": "healthy",
        "service": "TypeCast Uzbek Transliteration API",
        "libreoffice_available": soffice_path is not None,
        "libreoffice_path": soffice_path,
        "supported_formats": [".docx", ".doc", ".txt"],
        "supported_output_formats": [".docx", ".doc", ".pdf", ".txt"],
    }


@app.post("/api/transliterate/text", response_model=TextTransliterateResponse)
def transliterate_text_endpoint(payload: TextTransliterateRequest):
    """Real-time text-to-text transliteration endpoint."""
    try:
        converted = transliterate(payload.text, payload.direction)
        return TextTransliterateResponse(
            transliterated=converted,
            direction=payload.direction,
            length=len(converted),
        )
    except Exception as e:
        logger.error(f"Text transliteration failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Transliteration error: {str(e)}"
        )


@app.post("/api/transliterate/file")
async def transliterate_file_endpoint(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    direction: Literal["latin-to-cyrillic", "cyrillic-to-latin"] = Form("latin-to-cyrillic"),
    target_format: Optional[str] = Form("same"),
):
    """Uploads and transliterates a document (.docx, .doc, .txt).

    Streams the processed document back to the client and guarantees
    automatic cleanup of temporary files via FastAPI BackgroundTasks.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded.")

    _, ext = os.path.splitext(file.filename)
    ext_clean = ext.lower().lstrip(".")

    if ext_clean not in ("docx", "doc", "txt"):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file extension: .{ext_clean}. Only .docx, .doc, and .txt files are supported."
        )

    # Create isolated session directory
    session_id = str(uuid.uuid4())
    session_dir = f"/tmp/typecast_{session_id}"
    os.makedirs(session_dir, exist_ok=True)

    input_file_path = os.path.join(session_dir, file.filename)

    try:
        # Save uploaded file
        with open(input_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        output_dir = os.path.join(session_dir, "output")
        os.makedirs(output_dir, exist_ok=True)

        # Process document
        processed_file_path = process_document(
            input_file_path=input_file_path,
            output_dir=output_dir,
            direction=direction,
            target_format=target_format,
        )

        output_filename = os.path.basename(processed_file_path)

        # Map MIME types
        mime_types = {
            ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ".doc": "application/msword",
            ".pdf": "application/pdf",
            ".txt": "text/plain; charset=utf-8",
        }
        _, out_ext = os.path.splitext(output_filename)
        media_type = mime_types.get(out_ext.lower(), "application/octet-stream")

        # Schedule temp session directory cleanup after streaming
        background_tasks.add_task(cleanup_directory, session_dir)

        return FileResponse(
            path=processed_file_path,
            filename=output_filename,
            media_type=media_type,
            headers={
                "Access-Control-Expose-Headers": "Content-Disposition",
                "Content-Disposition": f'attachment; filename="{output_filename}"'
            }
        )

    except Exception as e:
        # If error occurred before streaming, clean up immediately
        cleanup_directory(session_dir)
        logger.error(f"Document processing failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process document: {str(e)}"
        )
