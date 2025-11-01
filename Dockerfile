FROM rust:1.84 as builder

WORKDIR /app

# Copy manifests from backend directory
COPY apps/backend/Cargo.toml ./
COPY apps/backend/Cargo.lock ./Cargo.lock

# Copy source code from backend directory
COPY apps/backend/src ./src
COPY apps/backend/migrations ./migrations

# Print toolchain versions for debugging and ensure no stale cache
RUN rustc --version && cargo --version

# Build release using the pinned lockfile
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
