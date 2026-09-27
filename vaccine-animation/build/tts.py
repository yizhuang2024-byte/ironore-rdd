"""Narration builder: synthesize each subtitle cue, stitch with pauses, emit timeline.json.

Engines:
  kokoro (default, offline)  – sherpa-onnx Kokoro multi-lang v1.1, Mandarin female voice
  gemini                     – Gemini TTS (needs GEMINI_API_KEY); prompt asks for a Taiwanese
                               accent and a warm storytelling tone
Every cue is synthesized separately, so subtitle switch points land exactly on the
narration pauses between cues.
"""
import argparse, base64, json, os, re, sys, urllib.request
import numpy as np, soundfile as sf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SR = 24000
PAUSE_CLAUSE, PAUSE_SENTENCE = 0.24, 0.42
CHAPTER_LEAD, CHAPTER_TAIL = 0.45, 0.45
INTRO_LEAD, OUTRO_TAIL = 1.2, 2.8


def tts_text(s):
    s = s.replace("「", "").replace("」", "").replace("？", "。").replace("！", "。")
    s = re.sub(r"([A-Za-z]+)(?=[一-鿿])", r"\1 ", s)  # "T細胞" -> "T 細胞"
    return s


class Kokoro:
    def __init__(self, sid, speed):
        import sherpa_onnx
        d = os.environ.get("KOKORO_DIR", "/tmp/tts/kokoro-multi-lang-v1_1/")
        k = sherpa_onnx.OfflineTtsKokoroModelConfig(
            model=d + "model.onnx", voices=d + "voices.bin", tokens=d + "tokens.txt",
            data_dir=d + "espeak-ng-data", dict_dir=d + "dict",
            lexicon=d + "lexicon-us-en.txt," + d + "lexicon-zh.txt")
        cfg = sherpa_onnx.OfflineTtsConfig(
            model=sherpa_onnx.OfflineTtsModelConfig(kokoro=k, num_threads=4),
            rule_fsts=d + "date-zh.fst," + d + "number-zh.fst")
        self.tts, self.sid, self.speed = sherpa_onnx.OfflineTts(cfg), sid, speed

    def __call__(self, text):
        a = self.tts.generate(text, sid=self.sid, speed=self.speed)
        x = np.asarray(a.samples, dtype=np.float32)
        if a.sample_rate != SR:
            x = np.interp(np.arange(0, len(x), a.sample_rate / SR), np.arange(len(x)), x).astype(np.float32)
        return x


class Gemini:
    URL = "https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent?key={k}"

    def __init__(self, voice, model):
        self.key = os.environ["GEMINI_API_KEY"]
        self.voice, self.model = voice, model

    def __call__(self, text):
        body = {
            "contents": [{"parts": [{"text": "請用台灣口音的年輕女生聲音，以溫柔、說故事的語氣朗讀：" + text}]}],
            "generationConfig": {"responseModalities": ["AUDIO"], "speechConfig": {
                "voiceConfig": {"prebuiltVoiceConfig": {"voiceName": self.voice}}}},
        }
        req = urllib.request.Request(self.URL.format(m=self.model, k=self.key),
                                     data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=120) as r:
            data = json.load(r)["candidates"][0]["content"]["parts"][0]["inlineData"]["data"]
        return np.frombuffer(base64.b64decode(data), dtype="<i2").astype(np.float32) / 32768  # 24 kHz PCM


def trim(x, thr=0.012):
    idx = np.where(np.abs(x) > thr)[0]
    if not len(idx):
        return x
    a, b = max(0, idx[0] - int(0.02 * SR)), min(len(x), idx[-1] + int(0.06 * SR))
    y = x[a:b].copy()
    f = int(0.01 * SR)
    y[:f] *= np.linspace(0, 1, f); y[-f:] *= np.linspace(1, 0, f)
    return y


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--engine", default="kokoro", choices=["kokoro", "gemini"])
    ap.add_argument("--sid", type=int, default=3)
    ap.add_argument("--speed", type=float, default=1.0)
    ap.add_argument("--voice", default="Leda")
    ap.add_argument("--model", default="gemini-2.5-flash-preview-tts")
    a = ap.parse_args()
    synth = Kokoro(a.sid, a.speed) if a.engine == "kokoro" else Gemini(a.voice, a.model)

    script = json.load(open(os.path.join(ROOT, "script.json"), encoding="utf-8"))
    out, t, chapters, cues = [], 0.0, [], []

    def silence(sec):
        nonlocal t
        out.append(np.zeros(int(sec * SR), np.float32)); t += sec

    silence(INTRO_LEAD)
    for ci, ch in enumerate(script["chapters"]):
        start = t
        silence(CHAPTER_LEAD if ci else 0.3)
        for k, cue in enumerate(ch["cues"]):
            x = trim(synth(tts_text(cue["zh"])))
            peak = np.abs(x).max() or 1
            x = x / peak * 0.89
            cues.append({"ch": ci, "start": round(t, 3), "end": round(t + len(x) / SR, 3), "zh": cue["zh"], "en": cue["en"]})
            out.append(x); t += len(x) / SR
            print(f"[{t:6.2f}] {cue['zh']}", file=sys.stderr)
            if k < len(ch["cues"]) - 1:
                silence(PAUSE_SENTENCE if cue["zh"][-1] in "。？！" else PAUSE_CLAUSE)
        silence(OUTRO_TAIL if ci == len(script["chapters"]) - 1 else CHAPTER_TAIL)
        chapters.append({"id": ch["id"], "zh": ch["zh"], "en": ch["en"], "start": round(start, 3), "end": round(t, 3)})
    chapters[0]["start"] = 0.0

    voice = np.concatenate(out)
    sf.write(os.path.join(ROOT, "audio", "narration.wav"), voice, SR)
    tl = {"title": script["title"], "duration": round(t, 3), "chapters": chapters, "cues": cues,
          "voice": {"engine": a.engine, "sid": a.sid, "speed": a.speed} if a.engine == "kokoro" else {"engine": "gemini", "voice": a.voice}}
    json.dump(tl, open(os.path.join(ROOT, "timeline.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"duration {t:.2f}s, {len(cues)} cues", file=sys.stderr)


if __name__ == "__main__":
    main()
