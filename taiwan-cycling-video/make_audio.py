# -*- coding: utf-8 -*-
"""用離線語音模型（sherpa-onnx + Kokoro 中文女聲）產生旁白，並計算字幕時間軸。

用法: python3 make_audio.py <模型資料夾> <輸出資料夾>
"""
import json
import os
import sys

import numpy as np
import sherpa_onnx
import soundfile as sf

from script import SCENES

SPEAKER_ID = 47      # Kokoro zf_xiaoxiao（中文女聲）
SPEED = 0.95
GAP = 0.35           # 每句之間的停頓（秒）
LEAD = 0.7           # 場景開頭留白
TAIL = 1.0           # 場景結尾留白


def build_tts(m):
    j = lambda f: os.path.join(m, f)
    cfg = sherpa_onnx.OfflineTtsConfig(
        model=sherpa_onnx.OfflineTtsModelConfig(
            kokoro=sherpa_onnx.OfflineTtsKokoroModelConfig(
                model=j("model.onnx"), voices=j("voices.bin"), tokens=j("tokens.txt"),
                data_dir=j("espeak-ng-data"), dict_dir=j("dict"),
                lexicon=j("lexicon-us-en.txt") + "," + j("lexicon-zh.txt")),
            num_threads=4),
        rule_fsts=",".join(j(f) for f in ["date-zh.fst", "phone-zh.fst", "number-zh.fst"]),
        max_num_sentences=1)
    return sherpa_onnx.OfflineTts(cfg)


def trim(x, thr=0.01):
    idx = np.where(np.abs(x) > thr)[0]
    if len(idx) == 0:
        return x
    a = max(idx[0] - 600, 0)
    b = min(idx[-1] + 2400, len(x))
    return x[a:b]


def main(model_dir, out):
    os.makedirs(out, exist_ok=True)
    tts = build_tts(model_dir)
    sr = None
    pieces = []
    timeline = []
    t = 0.0
    for si, sc in enumerate(SCENES):
        start = t
        t += sc.get("lead", LEAD)
        lines = []
        for li, (sub, say) in enumerate(sc["lines"]):
            a = tts.generate(say, sid=SPEAKER_ID, speed=SPEED)
            sr = a.sample_rate
            x = trim(np.asarray(a.samples, dtype=np.float32))
            dur = len(x) / sr
            pieces.append((t, x))
            lines.append(dict(sub=sub, start=round(t, 3), end=round(t + dur, 3)))
            print(f"[{si}:{li}] {dur:5.2f}s  {sub}", flush=True)
            t += dur + GAP
        t += sc.get("tail", TAIL) - (GAP if lines else 0)
        timeline.append(dict(kind=sc["kind"], start=round(start, 3), end=round(t, 3), lines=lines))

    total = np.zeros(int(t * sr) + sr, dtype=np.float32)
    for st, x in pieces:
        i = int(st * sr)
        total[i:i + len(x)] += x
    peak = np.max(np.abs(total)) or 1.0
    total = total / peak * 0.9
    sf.write(os.path.join(out, "narration.wav"), total[: int(t * sr)], sr)
    with open(os.path.join(out, "timeline.json"), "w", encoding="utf-8") as f:
        json.dump(dict(duration=round(t, 3), scenes=timeline), f, ensure_ascii=False, indent=1)
    print("total", round(t, 2), "s")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
