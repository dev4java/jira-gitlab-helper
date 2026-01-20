#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "Building..."
npx tsc -p .

echo "Packaging..."
npx vsce package --no-yarn

echo "Done!"
ls -lh *.vsix | tail -1
