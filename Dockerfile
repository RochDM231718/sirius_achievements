FROM node:20-slim AS frontend-build

WORKDIR /frontend

COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    tzdata \
    gosu \
    && rm -rf /var/lib/apt/lists/*

ENV TZ=Europe/Moscow

COPY requirements.txt .

RUN pip install --default-timeout=1000 --no-cache-dir torch torchvision torchaudio --extra-index-url https://download.pytorch.org/whl/cpu
RUN pip install --default-timeout=1000 --no-cache-dir -r requirements.txt

COPY . .
COPY --from=frontend-build /static/spa /app/static/spa

ENV HOME=/home/appuser

RUN addgroup --system appgroup \
    && adduser --system --ingroup appgroup --home /home/appuser appuser \
    && mkdir -p /app/static/uploads/achievements \
                /app/static/uploads/avatars \
                /app/static/uploads/support \
                /app/easyocr_models \
                /home/appuser/.EasyOCR \
    && chown -R appuser:appgroup /app /home/appuser \
    && chmod +x /app/entrypoint.sh

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
