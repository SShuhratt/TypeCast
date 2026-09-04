FROM python:3.11-slim

# Prevent interactive prompts and configure python runtime
ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Install system dependencies: headless LibreOffice, Java runtime, and core fonts
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-nogui \
    default-jre-headless \
    fonts-dejavu \
    fonts-liberation \
    curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy and install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY app/ /app/app/
COPY run.sh /app/run.sh
RUN chmod +x /app/run.sh

# Expose FastAPI service port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/api/health || exit 1

# Launch FastAPI with Uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
