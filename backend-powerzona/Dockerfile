FROM alpine:3.20

ARG POCKETBASE_VERSION=0.38.2

WORKDIR /app

RUN apk add --no-cache ca-certificates unzip wget \
  && wget -O /tmp/pocketbase.zip "https://github.com/pocketbase/pocketbase/releases/download/v${POCKETBASE_VERSION}/pocketbase_${POCKETBASE_VERSION}_linux_amd64.zip" \
  && unzip /tmp/pocketbase.zip -d /app \
  && rm /tmp/pocketbase.zip \
  && chmod +x /app/pocketbase \
  && mkdir -p /app/pb_data

COPY pb_migrations /app/pb_migrations

EXPOSE 8080

CMD ["./pocketbase", "serve", "--http=0.0.0.0:8080"]
