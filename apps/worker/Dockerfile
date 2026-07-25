FROM rust:bookworm AS builder
WORKDIR /app
COPY Cargo.toml ./
COPY apps/api ./apps/api
COPY apps/worker ./apps/worker
RUN cargo build --release -p streaming-worker

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/streaming-worker /usr/local/bin/streaming-worker
CMD ["streaming-worker"]
