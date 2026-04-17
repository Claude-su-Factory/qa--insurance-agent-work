FROM golang:1.23-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o ingestion-service ./cmd/main.go

FROM alpine:3.19
WORKDIR /app
COPY --from=builder /app/ingestion-service .
COPY config.toml .
EXPOSE 8081
CMD ["./ingestion-service"]
