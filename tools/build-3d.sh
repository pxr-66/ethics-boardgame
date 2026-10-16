#!/usr/bin/env bash
# 重新打包 3D 棋盘：修改 js/board3d.js 后在项目根目录运行  bash tools/build-3d.sh
npx --yes esbuild@0.24.2 js/board3d.js --bundle --minify --format=iife --target=es2020 \
  --alias:three/addons=./lib/three/addons --alias:three=./lib/three/three.module.min.js \
  --outfile=js/board3d.bundle.js
