FROM rust:1.84 as builder

WORKDIR /app

# NOTE: Railway typically builds this service with build context = apps/backend.
# So all COPY paths must be relative to that context (no "apps/backend/" prefix).

# Copy manifests
COPY Cargo.toml ./
COPY Cargo.lock ./Cargo.lock

# Copy source code + migrations
COPY src ./src
COPY migrations ./migrations

# Print toolchain versions and build release with pinned lockfile
RUN rustc --version && cargo --version
RUN cargo build --release

# Runtime stage
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/target/release/backend /app/backend
COPY --from=builder /app/migrations /app/migrations

EXPOSE 8080

CMD ["/app/backend"]
