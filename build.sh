#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "Building..."
npx tsc -p .

echo "Packaging..."
npx vsce package --no-yarn

# 创建plug-in目录（如果不存在）
mkdir -p plug-in

# 移动新打包的文件到plug-in目录
echo "Moving package to plug-in directory..."
mv *.vsix plug-in/

echo "Done!"
ls -lh plug-in/*.vsix | tail -1
