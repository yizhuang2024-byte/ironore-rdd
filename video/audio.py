"""Original score + sound design + narration mix, all synthesised here (no samples).
Output: build/mix.wav at -15 LUFS integrated, true-peak ≤ -1 dBTP."""
import json, numpy as np, soundfile as sf, pyloudnorm as pyln
from scipy.signal import lfilter, butter, sosfilt

SR = 48000
TL = json.load(open("build/timeline.json"))
TOTAL = TL["total"] + 0.5
N = int(TOTAL * SR)
SC = {s["name"]: s for s in TL["scenes"]}
LINES = {l["id"]: l for l in TL["lines"]}
rng = np.random.default_rng(7)
t_all = np.arange(N) / SR


def tt(sec): return int(sec * SR)
def add(buf, x, at, gain=1.0, pan=0.0):
    """mix mono x into stereo buf at time `at` with constant-power pan"""
    i = tt(at)
    if i >= N: return
    x = x[: N - i]
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    buf[i:i + len(x), 0] += x * gain * l * 1.414
    buf[i:i + len(x), 1] += x * gain * r * 1.414
def env_adsr(n, a=0.01, d=0.1, s=0.7, r=0.3):
    e = np.ones(n) * s
    A, D, R = int(a * SR), int(d * SR), int(r * SR)
    A = min(A, n); e[:A] = np.linspace(0, 1, A)
    D2 = min(D, n - A); e[A:A + D2] = np.linspace(1, s, D2)
    if R < n: e[n - R:] *= np.linspace(1, 0, R)
    return e
def lp(x, fc, order=2): return sosfilt(butter(order, fc, "low", fs=SR, output="sos"), x)
def hp(x, fc, order=2): return sosfilt(butter(order, fc, "high", fs=SR, output="sos"), x)
def bp(x, lo, hi, order=2): return sosfilt(butter(order, [lo, hi], "band", fs=SR, output="sos"), x)
def midi(m): return 440.0 * 2 ** ((m - 69) / 12)

# ───────────────────────── instruments ─────────────────────────
def pluck(freq, dur=2.6, bright=0.5, decay=0.996):
    """Karplus–Strong string (acoustic guitar-ish)"""
    n = int(dur * SR); L = max(2, int(SR / freq))
    exc = np.zeros(n); burst = rng.uniform(-1, 1, L)
    burst = lp(burst, 1500 + 5000 * bright, 1)
    exc[:L] = burst
    a = np.zeros(L + 2); a[0] = 1; a[L] = -decay / 2; a[L + 1] = -decay / 2
    y = lfilter([1], a, exc)
    y *= np.linspace(1, 0, n) ** 0.6
    body = lp(y, 3200, 2) + 0.25 * bp(y, 90, 260, 1)
    return body / (np.abs(body).max() + 1e-9)

def flute(freq, dur, vib=5.2, depth=0.006):
    n = int(dur * SR); t = np.arange(n) / SR
    ph = 2 * np.pi * np.cumsum(freq * (1 + depth * np.sin(2 * np.pi * vib * t) * np.clip(t / 0.4, 0, 1))) / SR
    y = np.sin(ph) + 0.22 * np.sin(2 * ph) + 0.07 * np.sin(3 * ph)
    y += 0.03 * lp(rng.normal(0, 1, n), 3000)                       # breath
    return y * env_adsr(n, 0.09, 0.2, 0.8, min(0.35, dur * 0.4))

def pad(freqs, dur):
    n = int(dur * SR); t = np.arange(n) / SR; y = np.zeros(n)
    for f in freqs:
        for det in (-0.25, 0.0, 0.3):
            ph = 2 * np.pi * (f * (1 + det / 100)) * t + rng.uniform(0, 6)
            y += np.sin(ph) + 0.35 * np.sin(2 * ph) + 0.12 * np.sin(3 * ph)
    y = lp(y, 1800, 2)
    return y / (len(freqs) * 3) * env_adsr(n, 0.9, 0.5, 0.85, 1.2)

def bass(freq, dur):
    n = int(dur * SR); t = np.arange(n) / SR
    y = np.sin(2 * np.pi * freq * t) + 0.3 * np.sin(4 * np.pi * freq * t)
    return y * env_adsr(n, 0.008, 0.25, 0.55, 0.25)

def brush(dur=0.25, amp=1.0):
    n = int(dur * SR)
    y = bp(rng.normal(0, 1, n), 2500, 9000) * np.exp(-np.arange(n) / SR * 18)
    return y * amp

def kick(dur=0.4):
    n = int(dur * SR); t = np.arange(n) / SR
    f = 50 + 70 * np.exp(-t * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9)

# ───────────────────────── score ─────────────────────────
BPM = 78; BEAT = 60 / BPM; BAR = BEAT * 4
G, D, Em, C, Am, Bm, Dsus = [55, 59, 62], [50, 54, 57], [52, 55, 59], [48, 52, 55], [45, 48, 52], [47, 50, 54], [50, 55, 57]
PROG = {  # chord progression per scene (one chord per bar, cycled)
    "open": [G, D, Em, C], "title": [C, G, D, D], "history": [Em, C, G, D], "discovery": [G, C, G, D],
    "production": [G, D, Em, C], "price": [Em, C, G, D, Am, Em, C, D], "cyclone": [Em, Em, C, Bm],
    "future": [C, G, D, Em, C, G, D, D], "closing": [C, D, G, G], "end": [C, G, D, G],
}
# layer gains per scene: (guitar, pad, flute, bass, brush)
MIX = {
    "open": (0.55, 0.30, 0.00, 0.25, 0.00), "title": (0.60, 0.45, 0.55, 0.35, 0.00),
    "history": (0.55, 0.35, 0.40, 0.30, 0.00), "discovery": (0.65, 0.25, 0.35, 0.40, 0.25),
    "production": (0.70, 0.30, 0.30, 0.45, 0.35), "price": (0.55, 0.40, 0.30, 0.35, 0.15),
    "cyclone": (0.25, 0.55, 0.00, 0.40, 0.00), "future": (0.65, 0.40, 0.45, 0.40, 0.25),
    "closing": (0.50, 0.55, 0.60, 0.30, 0.00), "end": (0.55, 0.45, 0.40, 0.30, 0.10),
}
def scene_at(t):
    for s in TL["scenes"]:
        if s["start"] <= t < s["end"]: return s["name"]
    return "end"

music = np.zeros((N, 2))
PENTA = [0, 2, 4, 7, 9]           # major pentatonic offsets
prev_note = 74
nbars = int(TOTAL / BAR) + 1
for b in range(nbars):
    t0 = b * BAR
    name = scene_at(t0 + 0.01)
    prog = PROG[name]; ch = prog[b % len(prog)]
    gg, gp, gf, gb, gr = MIX[name]
    fade_end = np.clip((TL["total"] - t0) / 4.0, 0, 1)
    if name == "end" and t0 > TL["total"] - 3: continue
    # fingerpicked guitar: Travis-style pattern, 8th notes
    pat = [0, 2, 1, 2, 0, 2, 1, 3] if name != "cyclone" else [0, -1, -1, 2, -1, -1, 1, -1]
    for k, p in enumerate(pat):
        if p < 0: continue
        m = ch[0] - 12 if p == 0 else (ch[p - 1] if p <= 3 else ch[2] + 12)
        if p == 3: m = ch[1] + 12
        sw = 0.04 if k % 2 else 0.0                                 # light swing feel
        add(music, pluck(midi(m), 2.4, 0.45 + 0.1 * (k % 2)), t0 + k * BEAT / 2 + sw, gg * 0.22 * fade_end, pan=-0.25 + 0.1 * (k % 3))
    add(music, pad([midi(n) for n in ch] + [midi(ch[0] - 12)], BAR + 1.2), t0, gp * 0.55 * fade_end, pan=0.15)
    add(music, bass(midi(ch[0] - 24), BEAT * 1.8), t0, gb * 0.55 * fade_end)
    add(music, bass(midi(ch[2] - 24 if name != "cyclone" else ch[0] - 24), BEAT * 1.6), t0 + 2 * BEAT, gb * 0.45 * fade_end)
    if gr:
        for k in range(4):
            add(music, brush(0.25, 1.0 if k % 2 else 0.55), t0 + k * BEAT, gr * 0.18 * fade_end, pan=0.3)
        add(music, kick(), t0, gr * 0.25 * fade_end)
    if name == "cyclone":                                           # low tension drone + timpani-like swells
        add(music, kick(1.2) * 0.8, t0, 0.35)
    # flute melody: phrase over chord tones / pentatonic, stepwise motion
    if gf > 0:
        rhythm = [(0, 1.5), (1.5, 0.5), (2, 2)] if b % 2 == 0 else [(0, 1), (1, 1), (2, 1), (3, 1)]
        for (bt, ln) in rhythm:
            root = ch[0] % 12
            cands = [o * 12 + root + p for o in (5, 6) for p in PENTA] + [n + 24 for n in ch]
            cands = [c for c in cands if 67 <= c <= 86]
            target = min(cands, key=lambda c: abs(c - prev_note) + (0 if c % 12 in [x % 12 for x in ch] else 2) + rng.uniform(0, 3))
            prev_note = target
            add(music, flute(midi(target), ln * BEAT * 0.98), t0 + bt * BEAT, gf * 0.20 * fade_end, pan=0.2)
# final resolving chord on the end card
endt = SC["end"]["start"] + 4.5
for i, m in enumerate([43, 55, 59, 62, 67]):
    add(music, pluck(midi(m), 5.5, 0.4, 0.998), endt + i * 0.09, 0.2)
add(music, pad([midi(n) for n in [55, 59, 62, 43]], 5.5), endt, 0.3)
music[-tt(3.0):] *= np.linspace(1, 0, tt(3.0))[:, None]

# ───────────────────────── sound effects ─────────────────────────
sfx = np.zeros((N, 2))
def noise(d): return rng.normal(0, 1, int(d * SR))
def wind(d, strength=1.0, lo=200, hi=1200):
    n = int(d * SR); t = np.arange(n) / SR
    y = bp(noise(d), lo, hi, 2)
    mod = 0.55 + 0.45 * np.sin(2 * np.pi * 0.11 * t + 1) * np.sin(2 * np.pi * 0.037 * t)
    return y * mod * strength * env_adsr(n, 1.0, 0.1, 1.0, 1.0)
def rainfx(d, heavy=1.0):
    n = int(d * SR)
    y = lp(hp(noise(d), 1500, 2), 6500, 2) * 0.35
    drops = np.zeros(n); idx = rng.integers(0, n, int(d * 900 * heavy)); drops[idx] = rng.uniform(0.3, 1, len(idx))
    y += lp(lfilter([1], [1, -0.97], drops), 6000) * 0.25
    return y * heavy * env_adsr(n, 1.2, 0.1, 1.0, 1.5)
def chirp(f0=3200, f1=4600, d=0.12):
    n = int(d * SR); t = np.arange(n) / SR
    f = np.linspace(f0, f1, n) * (1 + 0.08 * np.sin(2 * np.pi * 38 * t))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * t / d) ** 2
def birdsong(seed):
    r = np.random.default_rng(seed); out = []
    for _ in range(r.integers(3, 6)):
        f0 = r.uniform(2400, 3600); out.append(chirp(f0, f0 * r.uniform(1.15, 1.6), r.uniform(0.06, 0.14))); out.append(np.zeros(int(r.uniform(0.03, 0.09) * SR)))
    return np.concatenate(out)
def clang(f=820, d=1.4):
    n = int(d * SR); t = np.arange(n) / SR; y = np.zeros(n)
    for k, (mult, a, dec) in enumerate([(1, 1, 5), (2.76, 0.6, 7), (5.4, 0.4, 10), (8.93, 0.25, 14)]):
        y += a * np.sin(2 * np.pi * f * mult * t) * np.exp(-t * dec)
    y += bp(noise(d), 2000, 7000) * np.exp(-t * 40) * 0.8
    return y * 0.5
def thump(d=0.5):
    n = int(d * SR); t = np.arange(n) / SR
    return (np.sin(2 * np.pi * (60 + 40 * np.exp(-t * 20)) * t) * np.exp(-t * 10) + 0.4 * lp(noise(d), 800) * np.exp(-t * 20))
def horn(d=2.2, f=110):
    n = int(d * SR); t = np.arange(n) / SR
    y = sum(np.sign(np.sin(2 * np.pi * f * m * t)) * a for m, a in [(1, 1), (1.5, 0.5), (2.0, 0.25)])
    return lp(y, 900, 2) * env_adsr(n, 0.15, 0.2, 0.85, 0.5) * 0.4
def rumble(d, f=45):
    n = int(d * SR); t = np.arange(n) / SR
    return (lp(noise(d), 160, 2) * 2 + 0.3 * np.sin(2 * np.pi * f * t)) * env_adsr(n, 0.8, 0.1, 1, 1.0)
def clacks(d, period=0.62):
    out = np.zeros(int(d * SR)); click = bp(noise(0.05), 600, 3000) * np.exp(-np.arange(int(0.05 * SR)) / SR * 80)
    for k in range(int(d / period)):
        for off in (0, 0.11):
            i = tt(k * period + off)
            if i + len(click) < len(out): out[i:i + len(click)] += click
    return out
def whoosh(d=1.0, up=True):
    n = int(d * SR); x = noise(d); y = np.zeros(n)
    for k, seg_ in enumerate(np.array_split(np.arange(n), 20)):
        u = k / 19; fc = 300 + (u if up else 1 - u) * 4000
        y[seg_] = bp(x, fc * 0.7, min(fc * 1.4, 20000))[seg_]
    return y * np.sin(np.pi * np.arange(n) / n)
def crackle(d, dens=40):
    n = int(d * SR); y = np.zeros(n); idx = rng.integers(0, n, int(d * dens)); y[idx] = rng.uniform(-1, 1, len(idx))
    return hp(lfilter([1], [1, -0.6], y), 1500) * 2 + lp(noise(d), 400) * 0.15
def engine(d, f=38):
    n = int(d * SR); t = np.arange(n) / SR
    return (lp(np.sign(np.sin(2 * np.pi * f * t)), 300) * 0.4 + lp(noise(d), 200) * 0.6) * env_adsr(n, 0.5, 0.1, 1, 0.8)
def prop(d, f=72):
    n = int(d * SR); t = np.arange(n) / SR
    return lp(noise(d), 500) * (0.6 + 0.4 * np.sin(2 * np.pi * f * t)) * 1.5
def waves_fx(d):
    n = int(d * SR); t = np.arange(n) / SR
    return lp(noise(d), 700, 2) * (0.5 + 0.5 * np.sin(2 * np.pi * 0.16 * t) ** 2) * env_adsr(n, 1, 0.1, 1, 1)
def crickets(d):
    n = int(d * SR); t = np.arange(n) / SR
    return np.sin(2 * np.pi * 4300 * t) * (np.sin(2 * np.pi * 28 * t) > 0.6) * (np.sin(2 * np.pi * 0.9 * t) > 0) * 0.15
def scribble(d):
    n = int(d * SR); t = np.arange(n) / SR
    return bp(noise(d), 2500, 7000) * (0.4 + 0.6 * np.abs(np.sin(2 * np.pi * 3.1 * t))) * 0.25

def S(name): return SC[name]["start"]
def E(name): return SC[name]["end"]
def L(i): return LINES[i]["start"]

# open: wind, birds, ore train passing left→right
add(sfx, wind(E("open") - S("open") + 0.6, 0.5), 0, 0.5, -0.2)
for k, tb in enumerate([1.2, 3.6, 6.4, 8.8]): add(sfx, birdsong(10 + k), tb, 0.10, pan=0.5 - k * 0.3)
add(sfx, rumble(10.5), 0.2, 0.45, 0.0)
add(sfx, clacks(10.3, 0.62), 0.4, 0.35, 0.1)
add(sfx, horn(1.6, 146), 1.6, 0.18, 0.4)
# title: anvil strikes synced to the hammer (period 0.95, impact at 25% of cycle)
for k in range(6):
    ti = S("title") + k * 0.95 + 0.2375
    if ti < E("title") - 0.2: add(sfx, clang(880, 1.2), ti, 0.22, 0.1)
# history: meteor whoosh + impact, fire crackle, smith hammer, Bessemer roar
hs = S("history")
add(sfx, whoosh(1.1, False), hs + 0.4, 0.35, -0.6); add(sfx, thump(0.6), hs + 1.5, 0.5, 0.2)
add(sfx, wind(5.5, 0.3), hs, 0.35)
xB, xC = L(4), L(5)
add(sfx, crackle(xC - xB + 0.5, 50), xB - 0.6, 0.25, -0.3)
for k in range(40):                     # one clang per hammer impact (lt = k·0.9 + 0.225)
    imp = hs + k * 0.9 + 0.225
    if xB - 0.75 < imp < xC - 0.5: add(sfx, clang(1100, 0.9), imp, 0.18, 0.35)
pour = xC + 2.0 - hs
add(sfx, rumble(E("history") - (hs + pour) + 0.3, 60) * 0.8 + 0, hs + pour, 0.35, -0.2)
add(sfx, crackle(E("history") - (hs + pour), 120), hs + pour, 0.25, -0.2)
add(sfx, engine(3.5, 30) * 0.3, xC - 0.5, 0.2, 0.4)
# discovery: propeller plane crossing, stamp, ship horn, waves
ds = S("discovery"); x2 = L(7)
pl = prop(x2 - ds + 0.5) * np.linspace(0.3, 1, tt(x2 - ds + 0.5)) ** 0.5
add(sfx, pl, ds, 0.32, 0.0)
add(sfx, wind(E("discovery") - ds, 0.4), ds, 0.3)
add(sfx, thump(0.5), x2 + 1.62, 0.7, 0.1); add(sfx, whoosh(0.4, True), x2 + 1.35, 0.15)
add(sfx, waves_fx(E("discovery") - x2 + 0.5), x2 - 0.3, 0.35, 0.4)
add(sfx, horn(2.0, 98), x2 + 2.4, 0.22, 0.6)
# production: truck/excavator, conveyor+gulls at port, furnace roar in China
ps = S("production")
add(sfx, engine(L(10) - ps, 36), ps, 0.30, -0.3)
add(sfx, waves_fx(E("production") - L(10) + 1), L(10) - 0.6, 0.35, 0.3)
add(sfx, engine(L(11) - L(10) + 0.6, 55) * 0.6 + 0, L(10) - 0.4, 0.22, -0.1)
for k in range(3): add(sfx, birdsong(40 + k), L(10) + 0.8 + k * 1.4, 0.07, 0.4 - k * 0.3)
add(sfx, horn(2.2, 87), L(10) + 2.0, 0.24, 0.5)
add(sfx, rumble(E("production") - L(11) + 0.5, 50), L(11) - 0.3, 0.35, 0.3)
add(sfx, crackle(E("production") - L(11), 60), L(11), 0.12, 0.4)
# price: pen scribble while the line draws, soft dings at annotations
prs = S("price")
for i in range(12, 17):
    add(sfx, scribble(LINES[i]["end"] - LINES[i]["start"]), LINES[i]["start"], 0.18, -0.1)
    add(sfx, clang(1760, 0.8) * 0.4, LINES[i]["end"] - 0.2, 0.08, 0.2)
add(sfx, wind(E("price") - prs, 0.25), prs, 0.25)
# cyclone: strong wind, heavy rain, thunder after each lightning flash
cs = S("cyclone"); cd = E("cyclone") - cs
add(sfx, wind(cd + 0.6, 1.0, 150, 900), cs - 0.3, 0.75, -0.3)
add(sfx, wind(cd + 0.6, 0.7, 400, 2200), cs - 0.3, 0.35, 0.4)
add(sfx, rainfx(cd + 0.6, 1.0), cs - 0.3, 0.55, 0.0)
for ft in [3.1, 9.4, 15.8, 22.2, 27.0]:
    n = tt(3.5); tth = np.arange(n) / SR
    thunder = lp(noise(3.5), 300, 2) * (np.exp(-tth * 1.2) * (1 - np.exp(-tth * 18))) * 3 + lp(noise(3.5), 1500) * np.exp(-tth * 8)
    add(sfx, thunder, cs + ft + 0.25, 0.5, rng.uniform(-0.5, 0.5))
# future: sea + bird, turbines, steam
fs_ = S("future")
add(sfx, waves_fx(L(23) - fs_ + 0.5), fs_, 0.35, 0.2)
add(sfx, horn(1.8, 104), L(22) + 1.2, 0.18, 0.2)
for k in range(3): add(sfx, birdsong(60 + k), fs_ + 1 + k * 2.1, 0.07, -0.4 + k * 0.4)
add(sfx, wind(E("future") - L(24) + 1, 0.6) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.7 * np.arange(tt(E("future") - L(24) + 1)) / SR)), L(24) - 0.5, 0.3, -0.3)
# closing: night sea, crickets, distant horn
cls = S("closing")
add(sfx, waves_fx(E("closing") - cls + 1), cls - 0.3, 0.38)
add(sfx, crickets(E("closing") - cls + 0.5), cls, 0.10, -0.5)
add(sfx, horn(2.6, 82), cls + 2.8, 0.17, 0.3)
# end card: light train clacks
add(sfx, clacks(8, 0.5), S("end") + 0.5, 0.18, 0.0); add(sfx, rumble(8, 50), S("end") + 0.5, 0.15)

# ───────────────────────── narration ─────────────────────────
voice = np.zeros(N)
for l in TL["lines"]:
    x, sr = sf.read(f"build/tts/{l['id']:02d}.wav")
    assert sr == SR
    i = tt(l["start"]); voice[i:i + len(x)] += x[: N - i]
# light voice polish: high-pass rumble, gentle presence
voice = hp(voice, 80, 2)

# ───────────────────────── ducking & mix ─────────────────────────
envv = np.abs(voice)
win = int(0.05 * SR)
from scipy.ndimage import uniform_filter1d as _uf
envv = _uf(envv, win)
active = (envv > 0.01).astype(float)
# attack 80 ms, release 450 ms
a_att, a_rel = np.exp(-1 / (0.08 * SR)), np.exp(-1 / (0.45 * SR))
duck = lfilter([1 - a_rel], [1, -a_rel], active)
duck = np.maximum(duck, lfilter([1 - a_att], [1, -a_att], active))
duck = np.clip(duck, 0, 1)
music_g = 1 - 0.62 * duck            # ≈ -8.4 dB under narration
sfx_g = 1 - 0.45 * duck

mus = music * music_g[:, None]
fx = sfx * sfx_g[:, None]
vo = np.stack([voice, voice], 1)

meter = pyln.Meter(SR)
def lufs(x): return meter.integrated_loudness(x)
# balance stems: voice dominant, music bed ~ -11 LU below, effects ~ -13 LU below (measured as standalone)
vo *= 10 ** ((-16.5 - lufs(vo)) / 20)
mus *= 10 ** ((-27.0 - lufs(mus)) / 20)
# effects level set per scene (relative to the -16.5 LUFS voice), smoothly cross-faded at scene cuts
FX_TARGET = {"open": -30, "title": -29, "history": -31, "discovery": -31, "production": -31,
             "price": -35, "cyclone": -27, "future": -32, "closing": -31, "end": -32}
gcurve = np.ones(N)
for sc_ in TL["scenes"]:
    a_, b_ = tt(sc_["start"]), min(N, tt(sc_["end"]))
    try: cur = lufs(fx[a_:b_])
    except Exception: cur = -70
    gcurve[a_:b_] = 10 ** ((FX_TARGET[sc_["name"]] - cur) / 20) if np.isfinite(cur) else 1.0
k_ = int(0.7 * SR)
from scipy.ndimage import uniform_filter1d
gcurve = uniform_filter1d(gcurve, k_, mode="nearest")          # O(N) moving average
fx *= gcurve[:, None]
mix = vo + mus + fx

def limiter(x, ceiling_db=-1.2, look=0.004, rel=0.08):
    c = 10 ** (ceiling_db / 20)
    peak = np.max(np.abs(x), axis=1)
    from scipy.ndimage import maximum_filter1d
    need = np.minimum(1, c / np.maximum(maximum_filter1d(peak, int(look * SR) * 2 + 1), 1e-9))
    a = np.exp(-1 / (rel * SR))
    g = np.empty_like(need); cur = 1.0
    # fast attack (instant), smooth release
    for i in range(0, len(need), 64):
        blk = need[i:i + 64].min()
        cur = blk if blk < cur else cur + (1 - a ** 64) * (blk - cur)
        g[i:i + 64] = cur
    return x * g[:, None]

for it in range(4):
    mix *= 10 ** ((-15.0 - lufs(mix)) / 20)
    mix = limiter(mix)
print("integrated LUFS:", round(lufs(mix), 2), " peak dBFS:", round(20 * np.log10(np.abs(mix).max()), 2))
sf.write("build/mix.wav", mix.astype(np.float32), SR, subtype="FLOAT")
sf.write("build/stem_music.wav", (mus / max(1e-9, np.abs(mus).max()) * 0.5).astype(np.float32), SR)

# per-scene stem report (loudness of each stem inside each scene, after balancing)
if __name__ == "__main__":
    for s in TL["scenes"]:
        a, b = tt(s["start"]), tt(s["end"])
        row = []
        for nm, x in (("voice", vo), ("music", mus), ("sfx", fx)):
            try: row.append(f"{nm} {meter.integrated_loudness(x[a:b]):6.1f}")
            except Exception: row.append(f"{nm}   n/a")
        print(f"{s['name']:11s}", " | ".join(row))
