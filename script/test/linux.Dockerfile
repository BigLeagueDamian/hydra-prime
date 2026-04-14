FROM alpine:3.20
RUN apk add --no-cache bash openssl coreutils python3 iproute2 bats curl
WORKDIR /s
COPY . /s
CMD ["bash", "-lc", "bats test/*.bats"]
