# Stage 1: Build the source tree with Python dependencies
FROM python:3.11-slim AS builder
WORKDIR /app

# Install build dependencies if any native compilation steps trigger down the wire
COPY requirements.txt ./
RUN pip install --user --no-cache-dir -r requirements.txt

# ---

# Stage 2: Production execution environment
FROM python:3.11-slim AS runner
WORKDIR /app
ENV PYTHONUNBUFFERED=1

# Copy requirements for reference
COPY requirements.txt ./

# Install ONLY production dependencies to keep the image footprint ultra-lean
RUN pip install --no-cache-dir -r requirements.txt

# Copy the application code
COPY . .

EXPOSE 3000

# Execute your FastAPI daemon process
CMD ["python", "-m", "uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "3000"]