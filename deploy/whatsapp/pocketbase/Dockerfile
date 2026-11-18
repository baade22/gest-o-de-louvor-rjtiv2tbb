# PocketBase do LouvorFlow. Mesma versão que rodava no Skip (o painel /_/ do Skip mostrava
# v0.40.4 em 2026-11-18): o banco que vem de lá não pode abrir numa versão mais antiga.
FROM alpine:3.20

ARG PB_VERSION=0.40.4
ARG TARGETARCH

RUN apk add --no-cache ca-certificates unzip wget \
 && wget -q -O /tmp/pb.zip \
    "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${TARGETARCH:-amd64}.zip" \
 && unzip -q /tmp/pb.zip pocketbase -d /pb \
 && rm /tmp/pb.zip

EXPOSE 8090

# As migrações pendentes rodam sozinhas quando o PocketBase sobe.
# --automigrate=false: mexer em coleções pelo painel /_/ não gera arquivos de migração;
# o esquema só muda pelas migrações do repositório.
CMD ["/pb/pocketbase", "serve", \
     "--http=0.0.0.0:8090", \
     "--dir=/pb/pb_data", \
     "--hooksDir=/pb/pb_hooks", \
     "--migrationsDir=/pb/pb_migrations", \
     "--automigrate=false"]
