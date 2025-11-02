FROM rust:1.84 as builder

WORKDIR /app

# Copy manifests
COPY Cargo.toml ./
COPY Cargo.lock ./

# Copy source code
COPY src ./src
COPY migrations ./migrations

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
