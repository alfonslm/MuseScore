#!/bin/sh
# Build String Grip: tests, then versioned packages named from manifest.json.
set -e
cd "$(dirname "$0")"
V=$(python3 -c "import json;print(json.load(open('manifest.json'))['version'])")
node test.js | tail -1
node test_score.js | tail -1
OUT=${1:-/mnt/user-data/outputs}
rm -f "$OUT"/StringGrip*.mext "$OUT"/StringGrip*-source.zip
zip -j -q "$OUT/StringGrip-$V.mext" manifest.json Main.qml engine.js score.js quick.js clear.js README.md
zip -q -r "$OUT/StringGrip-$V-source.zip" . -x '*.mext'
echo "built StringGrip-$V.mext and StringGrip-$V-source.zip"
