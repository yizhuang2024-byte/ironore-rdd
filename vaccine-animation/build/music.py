"""Original procedural soundtrack (A minor, 96 BPM) + narration ducking + final mix."""
import json, os, subprocess
import numpy as np, soundfile as sf
import imageio_ffmpeg

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SR = 48000
tl = json.load(open(os.path.join(ROOT, "timeline.json"), encoding="utf-8"))
DUR = tl["duration"]
N = int(DUR * SR)
t = np.arange(N) / SR
BPM = 96; BEAT = 60 / BPM; BAR = 4 * BEAT
rng = np.random.default_rng(7)

def midi(m): return 440 * 2 ** ((m - 69) / 12)

def env_adsr(n, a, d, s, r):
    e = np.ones(n) * s
    A, D, R = int(a * SR), int(d * SR), int(r * SR)
    A = min(A, n); e[:A] = np.linspace(0, 1, A)
    D2 = min(D, n - A); e[A:A + D2] = np.linspace(1, s, D2)
    if R < n: e[-R:] *= np.linspace(1, 0, R)
    return e

def add(buf, start, sig):
    i = int(start * SR)
    if i >= len(buf): return
    j = min(len(buf), i + len(sig)); buf[i:j] += sig[: j - i]

# chord progression per bar: Am, F, C, G  (voicings)
PROG = [[57, 60, 64, 69], [53, 57, 60, 65], [55, 60, 64, 67], [55, 59, 62, 67]]
BASS = [45, 41, 48, 43]
pad = np.zeros(N); arp = np.zeros(N); bass = np.zeros(N); drums = np.zeros(N); shimmer = np.zeros(N)

nbars = int(DUR / BAR) + 2
for b in range(nbars):
    st = b * BAR; ch = PROG[b % 4]
    n = int(BAR * 1.35 * SR); tt = np.arange(n) / SR
    e = env_adsr(n, 0.9, 0.5, 0.8, 1.2)
    for m in ch:
        f = midi(m)
        for det in (-0.12, 0.12):  # detuned saw-ish pad via few harmonics
            ff = f * 2 ** (det / 12)
            s = sum(np.sin(2 * np.pi * ff * k * tt + k) / k for k in range(1, 6))
            add(pad, st, 0.035 * e * s)
    # sub bass
    nb = int(BAR * SR); tb = np.arange(nb) / SR
    add(bass, st, 0.16 * env_adsr(nb, 0.02, 0.3, 0.7, 0.3) * np.sin(2 * np.pi * midi(BASS[b % 4]) * tb))
    # arpeggio 1/8 notes
    pattern = [0, 1, 2, 3, 2, 1, 3, 2]
    for k, p in enumerate(pattern):
        m = ch[p] + 12; ns = int(0.55 * SR); ta = np.arange(ns) / SR
        s = np.sin(2 * np.pi * midi(m) * ta) + 0.35 * np.sin(2 * np.pi * midi(m) * 2 * ta)
        add(arp, st + k * BEAT / 2, 0.05 * np.exp(-ta * 7) * s)
    # drums: soft kick on 1 & 3, hats on offbeats
    for k in range(4):
        if k in (0, 2):
            nk = int(0.35 * SR); tk = np.arange(nk) / SR
            f = 40 + 90 * np.exp(-tk * 30)
            add(drums, st + k * BEAT, 0.33 * np.exp(-tk * 9) * np.sin(2 * np.pi * np.cumsum(f) / SR))
        nh = int(0.06 * SR)
        hat = rng.standard_normal(nh) * np.exp(-np.arange(nh) / SR * 70)
        hat = np.diff(hat, prepend=0)
        add(drums, st + k * BEAT + BEAT / 2, 0.035 * hat)
    # sparkle notes every 2 bars
    if b % 2 == 1:
        ns = int(2.0 * SR); ts = np.arange(ns) / SR
        add(shimmer, st + BEAT * 2.5, 0.03 * np.exp(-ts * 2) * np.sin(2 * np.pi * midi(ch[-1] + 24) * ts))

def lowpass(x, a):
    y = np.empty_like(x); acc = 0.0
    # simple one-pole via cumulative filter using lfilter-like loop replacement
    from numpy.lib.stride_tricks import sliding_window_view  # noqa
    return np.convolve(x, np.exp(-np.arange(int(a)) / (a / 5)) / (a / 5), mode="same")

pad = lowpass(pad, 60)
arp_echo = arp.copy()
d = int(BEAT * 0.75 * SR)
for k in range(1, 4):
    arp_echo[d * k:] += arp[:-d * k] * (0.45 ** k)

# arrangement: intro pad only, drums enter at chapter 2, drop out in final chapter
chs = tl["chapters"]
drum_gain = np.clip((t - chs[1]["start"]) / 2, 0, 1) * np.clip((chs[-1]["start"] + 2 - t) / 3, 0, 1)
arp_gain = np.clip((t - 3) / 3, 0, 1)
music = pad + arp_echo * arp_gain + bass * np.clip(t / 4, 0, 1) + drums * drum_gain + shimmer
# master fade
music *= np.clip(t / 2.5, 0, 1) * np.clip((DUR - t) / 3.0, 0, 1)
music /= np.abs(music).max()
sf.write(os.path.join(ROOT, "audio", "music_raw.wav"), (music * 0.9).astype(np.float32), SR)

# ---- ducking: gain 1.0 without narration, 0.25 while the narrator speaks ----
voiced = np.zeros(N)
for c in tl["cues"]:
    voiced[int(c["start"] * SR):int(c["end"] * SR)] = 1
# merge small gaps (< 0.6 s) so the music doesn't pump between clauses
g = 1 - voiced; target = 1 - voiced
gap_idx = np.where(np.diff(np.r_[0, voiced, 0]) != 0)[0]
for k in range(1, len(gap_idx) - 1, 2):
    a, bq = gap_idx[k], gap_idx[k + 1]
    if (bq - a) / SR < 0.6: target[a:bq] = 0
gain_t = 1 - 0.75 * (1 - target)
att, rel = 1 / (0.12 * SR), 1 / (0.6 * SR)
gain = np.empty(N); gcur = 1.0
for i in range(0, N, 48):  # control-rate smoothing, 1 ms blocks
    tgt = gain_t[i]
    rate = att if tgt < gcur else rel
    gcur += (tgt - gcur) * min(1, rate * 48 * 3)
    gain[i:i + 48] = gcur
music_ducked = music * gain * 0.42

v, vsr = sf.read(os.path.join(ROOT, "audio", "narration.wav"))
v = np.interp(np.arange(N) * vsr / SR, np.arange(len(v)), v)
mix = v * 0.92 + music_ducked
mix /= max(1.0, np.abs(mix).max() / 0.97)
sf.write(os.path.join(ROOT, "audio", "mix.wav"), mix.astype(np.float32), SR)
json.dump({"t": [round(i / 20, 2) for i in range(int(DUR * 20))],
           "g": [round(float(gain[int(i / 20 * SR)]), 3) for i in range(int(DUR * 20))]},
          open(os.path.join(ROOT, "audio", "duck.json"), "w"))
ff = imageio_ffmpeg.get_ffmpeg_exe()
for src, dst in (("mix.wav", "mix.m4a"), ("narration.wav", "narration.m4a"), ("music_raw.wav", "music.m4a")):
    subprocess.run([ff, "-y", "-loglevel", "error", "-i", os.path.join(ROOT, "audio", src), "-c:a", "aac", "-b:a", "160k",
                    os.path.join(ROOT, "audio", dst)], check=True)
print("ok", DUR)
