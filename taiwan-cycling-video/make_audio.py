# -*- coding: utf-8 -*-
"""產生旁白（台灣女聲 edge-tts，或離線 Kokoro 中文女聲），並計算字幕時間軸。

用法:
  python3 make_audio.py edge <輸出資料夾>        # 台灣女聲 zh-TW-HsiaoChenNeural（需連線 speech.platform.bing.com）
  python3 make_audio.py <Kokoro模型資料夾> <輸出資料夾>  # 離線中文女聲
"""
import asyncio
import json
import os
import subprocess
import sys

import numpy as np
import soundfile as sf

from script import SCENES

SPEAKER_ID = 47      # Kokoro zf_xiaoxiao（中文女聲）
SPEED = 0.95
GAP = 0.35           # 每句之間的停頓（秒）
LEAD = 0.7           # 場景開頭留白
TAIL = 1.0           # 場景結尾留白


def build_tts(m):
    import sherpa_onnx
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


EDGE_VOICE = "zh-TW-HsiaoChenNeural"
EDGE_RATE = "-3%"


class EdgeTTS:
    """以 edge-tts 產生台灣女聲，回傳與 sherpa-onnx 相同介面的結果。"""
    sample_rate = 24000

    def generate(self, say, sid=None, speed=None):
        import edge_tts
        proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")

        async def run():
            buf = b""
            for attempt in range(4):
                try:
                    com = edge_tts.Communicate(say, EDGE_VOICE, rate=EDGE_RATE, proxy=proxy)
                    buf = b""
                    async for ch in com.stream():
                        if ch["type"] == "audio":
                            buf += ch["data"]
                    return buf
                except Exception as e:  # 網路偶發錯誤重試
                    print("retry", attempt, e, flush=True)
                    await asyncio.sleep(2 * (attempt + 1))
            raise RuntimeError("edge-tts failed")

        mp3 = asyncio.run(run())
        pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", "-", "-f", "f32le", "-ac", "1", "-ar", "24000", "-"],
                             input=mp3, capture_output=True, check=True).stdout

        class R:
            pass
        r = R()
        r.samples = np.frombuffer(pcm, dtype=np.float32)
        r.sample_rate = 24000
        return r


def trim(x, thr=0.01):
    idx = np.where(np.abs(x) > thr)[0]
    if len(idx) == 0:
        return x
    a = max(idx[0] - 600, 0)
    b = min(idx[-1] + 2400, len(x))
    return x[a:b]


def main(model_dir, out):
    os.makedirs(out, exist_ok=True)
    tts = EdgeTTS() if model_dir == "edge" else build_tts(model_dir)
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
