FROM python:3.11-slim

# Prevent interactive prompts and configure python runtime
ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Install headless LibreOffice, Java runtime, core fonts, and curl for health check
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-nogui \
    default-jre-headless \
    fonts-dejavu \
    fonts-liberation \
    curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy and install Python dependencies
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source and frontend assets
COPY backend/ /app/backend/
COPY frontend/ /app/frontend/
COPY backend/run.sh /app/run.sh
RUN chmod +x /app/run.sh

# Expose service port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/api/health || exit 1

# Launch FastAPI via Uvicorn
CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
