#!/bin/bash
# Renders all frames in 4 parallel segments, then concatenates them losslessly.
set -e
cd "$(dirname "$0")/.."
N=4732; K=4; OUT=${1:-out/seg}; mkdir -p $OUT
for i in $(seq 0 $((K-1))); do a=$((N*i/K)); b=$((N*(i+1)/K)); node render/render.js video $OUT/seg$i.mp4 $a $b > $OUT/log$i.txt 2>&1 & done
wait
for i in $(seq 0 $((K-1))); do echo "file 'seg$i.mp4'"; done > $OUT/list.txt
"$FFMPEG" -y -loglevel error -f concat -safe 0 -i $OUT/list.txt -c copy $OUT/video.mp4
echo done
