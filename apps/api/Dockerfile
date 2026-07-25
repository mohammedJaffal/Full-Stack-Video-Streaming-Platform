FROM rust:1.82-bookworm AS build
WORKDIR /app
COPY Cargo.toml Cargo.toml
COPY src src
RUN cargo build --release
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/target/release/streaming-api /usr/local/bin/streaming-api
EXPOSE 8080
CMD ["streaming-api"]
