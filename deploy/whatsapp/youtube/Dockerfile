# Baixador do YouTube do LouvorFlow (vídeo ou áudio para a Mídia).
# yt-dlp + ffmpeg. O yt-dlp se atualiza sozinho uma vez por dia (o YouTube muda muito).
FROM python:3.12-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && pip install --no-cache-dir -U yt-dlp \
 && useradd -m -u 1000 app
WORKDIR /app
COPY server.py /app/server.py
ENV YT_DIR=/data PYTHONUNBUFFERED=1 PIP_DISABLE_PIP_VERSION_CHECK=1
RUN mkdir -p /data && chown app /data
USER app
EXPOSE 8090
CMD ["python", "/app/server.py"]
