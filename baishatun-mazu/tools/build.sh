#!/bin/bash
# Full pipeline: narration -> timeline -> frames -> audio -> mux.  (TTS needs KOKORO=<model dir>)
set -e; cd "$(dirname "$0")/.."
export FFMPEG=${FFMPEG:-$(python3 -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())")}
[ -n "$KOKORO" ] && python3 tools/tts.py
python3 tools/timeline.py
python3 make_paper.py
tools/render_all.sh out/seg
python3 tools/mix.py && tools/loudness.sh
python3 tools/srt.py
"$FFMPEG" -y -loglevel error -i out/seg/video.mp4 -i out/mix.wav -map 0:v -map 1:a -c:v libx264 -preset slow -crf 21 -tune animation -pix_fmt yuv420p -c:a aac -b:a 192k -ar 48000 -shortest -movflags +faststart out/baishatun_mazu.mp4
python3 tools/qa_frames.py out/baishatun_mazu.mp4
