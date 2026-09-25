FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

FROM base AS prod
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
ENTRYPOINT ["/app/entrypoint.sh"]
EXPOSE 8000
CMD ["sh", "-c", "uvicorn config.asgi:application --host 0.0.0.0 --port 8000 --workers ${UVICORN_WORKERS:-2} --proxy-headers --forwarded-allow-ips='*' --ws websockets"]

FROM base AS dev
COPY requirements.txt requirements-dev.txt ./
RUN pip install -r requirements-dev.txt
COPY . .
ENTRYPOINT ["/app/entrypoint.sh"]
EXPOSE 8000
CMD ["uvicorn", "config.asgi:application", "--host", "0.0.0.0", "--port", "8000", "--reload", "--ws", "websockets"]
