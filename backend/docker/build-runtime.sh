#!/bin/bash

# Build Python runtime images for code execution
# Usage: ./build-runtime.sh [version]
# Example: ./build-runtime.sh 3.11

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSIONS=("3.10" "3.11")
PLATFORM_ARGS=()

if [ -n "$EXECUTION_DOCKER_PLATFORM" ]; then
  PLATFORM_ARGS=(--platform "$EXECUTION_DOCKER_PLATFORM")
fi

if [ -n "$1" ]; then
  VERSIONS=("$1")
fi

for VERSION in "${VERSIONS[@]}"; do
  echo "Building Python $VERSION runtime..."
  docker build \
    "${PLATFORM_ARGS[@]}" \
    --build-arg PYTHON_VERSION="$VERSION" \
    -t "automl-python-runtime:$VERSION" \
    -t "automl-python-runtime:latest" \
    -f "$SCRIPT_DIR/Dockerfile.python-runtime" \
    "$SCRIPT_DIR"
  echo "✓ Built automl-python-runtime:$VERSION"
done

echo ""
echo "Available images:"
docker images | grep automl-python-runtime
