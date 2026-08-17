FROM python:3.13-slim

WORKDIR /app

# System deps for psycopg2-binary/cryptography wheels on slim images.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --require-hashes -r requirements.txt

COPY . .

# Non-root: never run the app as root in the container.
RUN useradd --create-home --uid 1000 appuser && chown -R appuser:appuser /app
USER appuser

# APP_ENV/ENVIRONMENT and every other secret are set at the platform level
# (Railway/Render env var UI) — never baked into the image. See
# .env.example for the full list and docs/adr/0018 for what
# ENVIRONMENT=production enforces at boot.
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
