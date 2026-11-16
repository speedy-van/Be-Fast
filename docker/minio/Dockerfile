FROM golang:1.27.4-alpine3.24@sha256:70bd7ddea8b6cbe5d6943cde279d6b67feb10cc924fb9100d1d8757c1575b280 AS build

# The last upstream MinIO Community release is distributed as source.
ENV CGO_ENABLED=0 GOTOOLCHAIN=local
RUN go install -trimpath -ldflags '-s -w \
      -X github.com/minio/minio/cmd.Version=2025-10-15T17:29:55Z \
      -X github.com/minio/minio/cmd.ReleaseTag=RELEASE.2025-10-15T17-29-55Z \
      -X github.com/minio/minio/cmd.CommitID=9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a' \
    github.com/minio/minio@v0.0.0-20251015172955-9e49d5e7a648

FROM alpine:3.24.4@sha256:f59abe656b692d901e184be3445e084786602108599d2a51d229c0f5a48c71bf
COPY --from=build /go/bin/minio /usr/local/bin/minio
RUN mkdir -m 0750 /data && chown 10001:10001 /data
ENV HOME=/tmp
USER 10001:10001
ENTRYPOINT ["minio"]
CMD ["server", "/data", "--console-address", ":9001"]
