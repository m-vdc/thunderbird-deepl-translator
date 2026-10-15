#!/bin/bash
# Build script for DeepL Translator Thunderbird extension

set -e

EXTENSION_DIR="/home/marc/thunderbird-deepl-translator"
SRC_DIR="${EXTENSION_DIR}/src"
BUILD_DIR="${EXTENSION_DIR}/build"
VERSION=$(grep '"version"' "${SRC_DIR}/manifest.json" | sed -E 's/.*"version": "([^"]+)".*/\1/')
XPI_NAME="deepl-translator-v${VERSION}.xpi"

echo "Building DeepL Translator v${VERSION}..."

# Clean and create build directory
rm -rf "${BUILD_DIR}"
mkdir -p "${BUILD_DIR}"

# Copy source files to build directory
cp -r "${SRC_DIR}"/* "${BUILD_DIR}/"

# Create XPI (zip file)
cd "${BUILD_DIR}"
zip -r "../${XPI_NAME}" . -x "*.DS_Store" "*.git*" "*.map" "*/tests/*" "*/.git/*" "*/node_modules/*"

echo "✅ Extension built: ${EXTENSION_DIR}/${XPI_NAME}"
echo "Size: $(du -h "../${XPI_NAME}" | cut -f1)"

# Verify XPI contents
echo ""
echo "XPI contents:"
unzip -l "../${XPI_NAME}"