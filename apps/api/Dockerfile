FROM rust:1.82-bookworm AS builder
WORKDIR /app
COPY Cargo.toml ./
COPY apps/api ./apps/api
COPY apps/worker ./apps/worker
RUN cargo build --release -p streaming-api

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/streaming-api /usr/local/bin/streaming-api
EXPOSE 8080
CMD ["streaming-api"]
