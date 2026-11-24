#!/usr/bin/env bash
# Combine rendered picture + mixed audio into the deliverable MP4 and copy the companion files.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p output
ffmpeg -y -v error -i build/video_noaudio.mp4 -i build/mix.wav \
  -map 0:v:0 -map 1:a:0 -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -r 30 \
  -c:a aac -b:a 192k -ar 48000 -shortest -movflags +faststart \
  -metadata title="紅土上的鋼鐵脈動 — 鐵礦石的歷史、澳洲產地與價格波動" \
  output/ironore_story.mp4
cp build/ironore_story.srt output/ironore_story.srt
cp sources.md output/sources.md
ffprobe -v error -show_entries stream=codec_name,width,height,r_frame_rate,sample_rate:format=duration,size -of compact output/ironore_story.mp4
