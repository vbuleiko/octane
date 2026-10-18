FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DATA_DIR=/data

WORKDIR /srv
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
RUN useradd --system --uid 1000 --create-home app && mkdir -p /data/media && chown -R app /data
USER app

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/healthz', timeout=4)"

# threads: photo uploads take a second of work each, while other pages keep coming
CMD ["gunicorn", "--preload", "--workers", "2", "--threads", "6", "--timeout", "60", "--bind", "0.0.0.0:8000", \
     "--access-logfile", "-", "app:create_app()"]
