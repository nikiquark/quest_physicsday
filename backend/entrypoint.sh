#!/bin/sh
set -e

python - <<'PY'
import os, time, psycopg
for attempt in range(60):
    try:
        psycopg.connect(
            host=os.environ.get("POSTGRES_HOST", "postgres"),
            port=os.environ.get("POSTGRES_PORT", "5432"),
            dbname=os.environ.get("POSTGRES_DB", "physquest"),
            user=os.environ.get("POSTGRES_USER", "physquest"),
            password=os.environ.get("POSTGRES_PASSWORD", "physquest"),
        ).close()
        break
    except psycopg.OperationalError:
        print("waiting for postgres...", flush=True)
        time.sleep(1)
else:
    raise SystemExit("postgres is not available")
PY

python manage.py migrate --noinput
python manage.py seed
python manage.py ensure_superuser
python manage.py collectstatic --noinput -v 0

exec "$@"
