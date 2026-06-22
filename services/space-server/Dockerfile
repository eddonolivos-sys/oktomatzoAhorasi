FROM golang:1.22-alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /space-server .

FROM alpine:3.20
RUN apk --no-cache add ca-certificates tzdata
COPY --from=builder /space-server .
EXPOSE 8080
CMD ["./space-server"]
