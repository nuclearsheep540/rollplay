# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Fix for friendlywords package - missing data files
# The PyPI package is missing word list files, so we download them from GitHub
RUN mkdir -p /usr/local/lib/python3.11/site-packages/friendlywords/data && \
    curl -s https://raw.githubusercontent.com/glitchdotcom/friendly-words/main/words/predicates.txt \
         -o /usr/local/lib/python3.11/site-packages/friendlywords/data/predicates.txt && \
    curl -s https://raw.githubusercontent.com/glitchdotcom/friendly-words/main/words/objects.txt \
         -o /usr/local/lib/python3.11/site-packages/friendlywords/data/objects.txt && \
    curl -s https://raw.githubusercontent.com/glitchdotcom/friendly-words/main/words/teams.txt \
         -o /usr/local/lib/python3.11/site-packages/friendlywords/data/teams.txt && \
    curl -s https://raw.githubusercontent.com/glitchdotcom/friendly-words/main/words/collections.txt \
         -o /usr/local/lib/python3.11/site-packages/friendlywords/data/collections.txt

# Copy source code
COPY . .

# Expose port
EXPOSE 8082

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8082/health || exit 1

# Run the application (no reload in production)
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8082"]