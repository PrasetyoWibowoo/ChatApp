FROM rust:latest as builder

WORKDIR /app

# Update rustup and use nightly for edition2024 support
RUN rustup default nightly

# Copy manifests
COPY Cargo.toml ./

# Copy source code
COPY src ./src
COPY migrations ./migrations

# Build release
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
