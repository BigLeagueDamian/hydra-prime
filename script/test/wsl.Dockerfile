FROM ubuntu:24.04
RUN apt-get update && apt-get install -y --no-install-recommends \
  bash openssl coreutils python3 iproute2 bats curl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /s
COPY . /s
CMD ["bash", "-lc", "bats test/*.bats"]
