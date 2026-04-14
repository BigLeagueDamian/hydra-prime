#!/usr/bin/env bash
set -eu
cd "$(dirname "$0")/.."

docker build -q -f test/linux.Dockerfile -t hydra-script-linux .
docker build -q -f test/wsl.Dockerfile -t hydra-script-wsl .

docker run --rm hydra-script-linux
docker run --rm hydra-script-wsl

echo "all suites passed"
