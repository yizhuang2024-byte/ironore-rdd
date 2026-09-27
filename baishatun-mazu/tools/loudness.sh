#!/bin/bash
# Brings out/mix_raw.wav to -15 LUFS integrated with true peak <= -1.5 dBTP (gain + limiter, iterated).
FF=${FFMPEG:-ffmpeg}; G=0
meas() { "$FF" -hide_banner -i "$1" -af ebur128=peak=true -f null - 2>&1 | awk '/I:/{i=$2} /Peak:/{p=$2} END{print i, p}'; }
read I P < <(meas out/mix_raw.wav); G=$(python3 -c "print(-15-($I))")
for k in 1 2 3 4; do
  "$FF" -hide_banner -loglevel error -y -i out/mix_raw.wav -af "volume=${G}dB,alimiter=limit=0.76:attack=4:release=60:level=disabled,aresample=192000,alimiter=limit=0.79:attack=1:release=40:level=disabled,aresample=48000" -c:a pcm_f32le out/mix.wav
  read I P < <(meas out/mix.wav); echo "pass $k gain=$G -> I=$I LUFS TP=$P dBTP"
  G=$(python3 -c "print($G+(-15-($I)))")
done
