# Original score (guzheng / dizi / Chinese drums & gongs), sound effects, narration and ducking.
# Output: out/mix_raw.wav (then loudness-normalised to -15 LUFS by build.sh)
import json, subprocess, os
import numpy as np, soundfile as sf
from scipy.signal import butter, sosfilt, fftconvolve, resample_poly

SR = 48000
TL = json.load(open('timeline.json'))
CUES = json.loads(subprocess.check_output(['node', '-e', "const {CUES}=require('./render/scenes.js');console.log(JSON.stringify(CUES))"]))
DUR = TL['duration'] + 0.2
N = int(DUR * SR)
rng = np.random.default_rng(2026)
mus = np.zeros((N, 2)); sfx = np.zeros((N, 2)); vo = np.zeros(N)
SCN = {s['id']: s for s in TL['scenes']}

def put(buf, x, t, pan=0.0, g=1.0):
    i = int(t * SR)
    if i >= len(buf) or i + len(x) <= 0: return
    if i < 0: x = x[-i:]; i = 0
    x = x[:len(buf) - i] * g
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    buf[i:i + len(x), 0] += x * l * 1.414; buf[i:i + len(x), 1] += x * r * 1.414

def tt(d): return np.arange(int(d * SR)) / SR
def bp(x, lo, hi, o=2): return sosfilt(butter(o, [lo, hi], 'band', fs=SR, output='sos'), x)
def lp(x, f, o=2): return sosfilt(butter(o, f, 'low', fs=SR, output='sos'), x)
def hp(x, f, o=2): return sosfilt(butter(o, f, 'high', fs=SR, output='sos'), x)
def env(n, a, r):
    e = np.ones(n); a = int(a * SR); r = int(r * SR)
    if a: e[:a] = np.linspace(0, 1, a)
    if r: e[-r:] *= np.linspace(1, 0, r)
    return e
noise = lambda d: rng.standard_normal(int(d * SR))

# ---------------- instruments ----------------
D4 = 293.66
PENT = [0, 2, 4, 7, 9]
def deg(d, octv=0):
    o, k = divmod(d, 5)
    return D4 * 2 ** ((PENT[k] + 12 * (o + octv)) / 12)

def zheng(f, d=2.2, vel=1.0, bend=0.0):
    t = tt(d)
    fm = f * (1 + bend * np.clip(t - 0.25, 0, None) * 0.08 * np.sin(2 * np.pi * 5.5 * t))  # 按音 vibrato
    ph = 2 * np.pi * np.cumsum(fm) / SR
    x = np.zeros_like(t)
    for k in range(1, 9):
        a = (0.9 / k ** 1.1) * (1 if k % 2 else 0.8)
        x += a * np.sin(k * ph * (1 + 0.0009 * k * k)) * np.exp(-t * (1.6 + 0.9 * k))
    x += 0.25 * lp(noise(d), 4000) * np.exp(-t * 60)  # pluck transient
    return x * vel * env(len(t), 0.002, 0.05) * 0.28

def dizi(f, d, vel=1.0):
    t = tt(d)
    vib = 1 + 0.006 * np.sin(2 * np.pi * 5.2 * t) * np.clip(t / 0.4, 0, 1)
    ph = 2 * np.pi * np.cumsum(f * vib) / SR
    x = np.sin(ph) + 0.35 * np.sin(2 * ph) + 0.12 * np.sin(3 * ph) + 0.05 * np.sin(4 * ph)
    breath = bp(noise(d), f * 0.8, min(f * 4, 18000)) * 0.12
    buzz = 0.06 * np.sin(ph * 2) * (0.5 + 0.5 * np.sin(2 * np.pi * 31 * t))  # 笛膜 buzz
    return (x + breath + buzz) * env(len(t), 0.06, min(0.25, d * 0.4)) * vel * 0.16

def drum(vel=1.0, f0=95):
    t = tt(0.7)
    f = f0 * (1 + 0.8 * np.exp(-t * 30))
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7)
    x += 0.3 * lp(noise(0.7), 1200) * np.exp(-t * 35)
    return x * vel * 0.55

def gong(vel=1.0, d=5.0, f0=110):
    t = tt(d)
    x = np.zeros_like(t)
    for k, (m, a, dec) in enumerate([(1, 1, 0.9), (1.52, 0.6, 1.1), (2.03, 0.45, 1.4), (2.74, 0.3, 1.8), (3.3, 0.25, 2.2), (4.1, 0.2, 2.6)]):
        fk = f0 * m * (1 - 0.015 * np.exp(-t * 2))  # pitch glide downwards
        x += a * np.sin(2 * np.pi * np.cumsum(fk) / SR + k) * np.exp(-t * dec)
    x *= np.clip(t / 0.02, 0, 1) * (1 + 0.4 * np.clip(t / 0.3, 0, 1))
    return x * vel * 0.3

def cymbal(vel=1.0, d=0.8):
    t = tt(d); return hp(noise(d), 4000) * np.exp(-t * 6) * vel * 0.12

def woodblock(vel=1.0):
    t = tt(0.15); return (np.sin(2 * np.pi * 820 * t) + 0.5 * np.sin(2 * np.pi * 1350 * t)) * np.exp(-t * 45) * vel * 0.25

def drone(f, d, vel=1.0):
    t = tt(d); x = np.zeros_like(t)
    for k, a in [(1, 1), (1.5, 0.5), (2, 0.4), (3, 0.15)]:
        x += a * np.sin(2 * np.pi * f * k * t + k) * (1 + 0.2 * np.sin(2 * np.pi * 0.2 * t * k))
    return lp(x, 1500) * env(len(t), 1.5, 1.5) * vel * 0.05

# ---------------- score ----------------
PHR = {
    'A': [(0, 1), (1, .5), (2, .5), (4, 1), (3, 1), (2, 2)],
    'B': [(4, 1), (5, .5), (4, .5), (2, 1), (1, 1), (0, 2)],
    'C': [(2, .5), (3, .5), (4, 1), (5, 1), (4, .5), (3, .5), (2, 2)],
    'D': [(5, 1.5), (4, .5), (2, 1), (1, 1), (0, 4)],
    'E': [(7, 1), (6, .5), (5, .5), (4, 1), (5, 1), (4, 2)],
}
CHORDS = [[0, 2, 3], [-1, 0, 2], [1, 3, 4], [3, 0, 1]]  # scale-degree triads (pentatonic)
# scene: tempo, intensity, dizi phrases, style
PLAN = {
    's01_coast':   (72, 0.6, 'AB', 'arp'),
    's02_title':   (60, 0.8, '', 'title'),
    's03_jiao':    (60, 0.4, 'D', 'sparse'),
    's04_depart':  (112, 1.0, 'CA', 'luogu'),
    's05_route':   (96, 0.7, 'BAC', 'pulse'),
    's06_pink':    (132, 1.0, 'CECA', 'fast'),
    's07_river':   (84, 0.7, 'D', 'tremolo'),
    's08_village': (80, 0.6, 'AD', 'arp'),
    's09_beigang': (60, 0.6, 'D', 'solemn'),
    's10_return':  (120, 1.0, 'CEC', 'luogu'),
    's11_closing': (66, 0.8, 'ADBD', 'arp'),
    's12_end':     (60, 0.5, 'D', 'end'),
}

def scene_music(sid):
    sc = SCN[sid]; st, en = sc['start'], sc['end']; d = en - st
    bpm, inten, phr, style = PLAN[sid]; beat = 60 / bpm
    buf = np.zeros((int((d + 6) * SR), 2))
    def at(x, t, pan=0, g=1):
        if t < d + 0.3: put(buf, x, t, pan, g)
    nbeats = int(d / beat) + 1
    # drone bed
    at(drone(deg(0, -2), d + 1.5, 0.8 + inten * 0.4), 0, 0)
    for b in range(nbeats):
        t = b * beat; bar, pos = divmod(b, 4); ch = CHORDS[bar % 4]
        if style in ('arp', 'pulse', 'fast', 'luogu'):
            if style != 'arp' or b % 1 == 0:
                for k, dd in enumerate([ch[0], ch[1], ch[2], ch[1] + 5]):
                    if style == 'fast' and k % 2: continue
                    at(zheng(deg(dd, -1 if k < 3 else -1), 1.8, 0.5 + 0.2 * inten), t + k * beat / 4, -0.35 + 0.2 * k)
            if pos == 0: at(zheng(deg(ch[0], -2), 3, 0.9, bend=1), t, -0.2)
        if style == 'sparse' and pos in (0, 2): at(zheng(deg(ch[pos // 2], -1), 3, 0.6, bend=pos == 2), t, -0.3)
        if style == 'sparse': at(woodblock(0.5), t, 0.4)
        if style == 'tremolo':
            for k in range(8): at(zheng(deg(ch[0] + (k // 4), -1), 0.6, 0.35), t + k * beat / 8, -0.3)
            if pos == 0: at(drum(0.7, 70), t, 0.1)
        if style == 'solemn':
            if b % 8 == 0: at(gong(0.8, 6, 90), t, 0.1)
            if pos == 0: at(zheng(deg(ch[0], -2), 3, 0.7, bend=1), t, -0.2)
            if pos == 2: at(zheng(deg(ch[2], -1), 2.5, 0.5), t, 0.2)
        if style in ('luogu', 'fast', 'pulse'):
            pat = {'luogu': [1, 0, .6, .6], 'fast': [1, .5, .8, .5], 'pulse': [.7, 0, .4, 0]}[style]
            if pat[pos]: at(drum(pat[pos] * inten, 90), t, 0.1)
            if style == 'luogu':
                if pos == 3: at(gong(0.35, 1.5, 420), t, 0.35); at(cymbal(0.8), t, -0.3)
                if pos == 2: at(drum(0.5, 110), t + beat / 2, 0.1)
                if bar % 2 == 1 and pos == 0: at(gong(0.6, 3, 150), t, 0.2)
            if style == 'fast':
                at(cymbal(0.35, 0.3), t + beat / 2, -0.3)
                if pos == 0 and bar % 2 == 0: at(gong(0.4, 1.5, 400), t, 0.35)
    if style == 'title':
        for k, dd in enumerate(range(0, 11)): at(zheng(deg(dd, -1), 2.2, 0.7), 0.15 + k * 0.06, -0.5 + k * 0.1)
        at(gong(1.0, 6, 105), 0.3, 0); at(drum(1.0, 80), 2.8, 0)
        at(dizi(deg(4, 1), 2.6, 0.9), 3.3, 0.25); at(dizi(deg(2, 1), 1.2, 0.8), 5.0, 0.25)
    if style == 'end':
        for k, dd in enumerate(range(10, -1, -1)): at(zheng(deg(dd, -1), 2.5, 0.6), 0.3 + k * 0.08, 0.5 - k * 0.1)
        at(gong(0.8, 8, 98), 0.6, 0)
        at(zheng(deg(0, -2), 6, 0.9, bend=1), 4.0, 0)
    # dizi melody
    if phr:
        t = 2 * beat if style != 'sparse' else 4 * beat
        octv = 1 if style in ('luogu', 'fast') else 0
        mul = 1 if bpm < 100 else 2  # melodic beats per note unit
        for p in phr * 3:
            for dd, ln in PHR[p]:
                dur = ln * beat * (1 if mul == 1 else 1)
                if t + dur > d - 0.5: break
                at(dizi(deg(dd, octv), dur * 0.95, 0.7 + 0.3 * inten), t, 0.25)
                t += dur
            t += beat
    # fades
    n = int((d + 0.8) * SR); buf = buf[:n]
    buf *= env(n, 0.25, 1.0)[:, None]
    return buf, st

for sid in PLAN:
    b, st = scene_music(sid); put_at = int(st * SR)
    m = min(len(b), N - put_at); mus[put_at:put_at + m] += b[:m]

# ---------------- sound effects ----------------
def s_waves(d):
    t = tt(d); x = lp(noise(d), 700) * 0.5 + bp(noise(d), 800, 3000) * 0.15
    swell = 0.35 + 0.65 * (0.5 + 0.5 * np.sin(2 * np.pi * t / 4.5 - 1.5)) ** 2
    return x * swell * env(len(t), 1.0, 1.0) * 0.5
def s_gulls():
    out = np.zeros(int(2.5 * SR))
    for k in range(3):
        t = tt(0.35); f = 1900 - 700 * t / 0.35 + 150 * np.sin(2 * np.pi * 18 * t)
        c = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * t / 0.35) ** 2
        i = int((0.3 + k * 0.6) * SR); out[i:i + len(c)] += c * 0.08
    return out
def s_jiao(v=1.0):
    t = tt(0.25); x = sum(a * np.sin(2 * np.pi * f * t) * np.exp(-t * dd) for f, a, dd in [(620, 1, 30), (1180, 0.7, 40), (2300, 0.4, 55)])
    return (x + bp(noise(0.25), 1500, 6000) * np.exp(-t * 80)) * 0.35 * v
def s_bell():
    t = tt(2.5); return sum(a * np.sin(2 * np.pi * f * t) * np.exp(-t * dd) for f, a, dd in [(1760, 1, 2), (2640, .5, 3), (4230, .3, 4), (5100, .15, 5)]) * 0.12
def s_firecrackers(d):
    out = np.zeros(int((d + 1) * SR)); n = int(d * 38)
    for k in range(n):
        t0 = rng.uniform(0, d); L = int(0.06 * SR); t = np.arange(L) / SR
        p = hp(rng.standard_normal(L), 300) * np.exp(-t * rng.uniform(60, 120)) * rng.uniform(0.3, 1)
        i = int(t0 * SR); out[i:i + L] += p
    return out * 0.35 * env(len(out), 0.05, 0.6)
def s_firework():
    whistle_d = 0.7; t = tt(whistle_d); f = 1200 + 1400 * t / whistle_d
    w = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.05 * env(len(t), 0.1, 0.1)
    tb = tt(3.0); boom = lp(noise(3.0), 180, 4) * np.exp(-tb * 2.5) * 2.2 + np.sin(2 * np.pi * 50 * tb) * np.exp(-tb * 5) * 0.5
    cr = np.zeros(len(tb))
    for k in range(120):
        i = int(rng.uniform(0.25, 2.4) * SR); L = 400; cr[i:i + L] += hp(rng.standard_normal(L), 3000) * np.exp(-np.arange(L) / 60) * rng.uniform(0.1, 0.4)
    out = np.zeros(len(t) + len(tb)); out[:len(t)] += w; out[len(t):] += (boom + cr) * 0.4
    return out
def s_stamp():
    t = tt(0.5); return (np.sin(2 * np.pi * 70 * t) * np.exp(-t * 14) + lp(noise(0.5), 900) * np.exp(-t * 30) * 0.5) * 0.7
def s_whoosh():
    d = 1.4; t = tt(d); x = noise(d); y = np.zeros_like(x)
    for k in range(7):
        a, b = int(k * len(x) / 7), int((k + 1) * len(x) / 7); fc = 400 + 2600 * (k / 6)
        y[a:b] = bp(x, fc * 0.7, fc * 1.3)[a:b]
    return y * np.sin(np.pi * t / d) ** 2 * 0.35
def s_run(d):
    out = np.zeros(int(d * SR)); step = 60 / 190
    for k in range(int(d / step)):
        for j in range(3):
            t0 = k * step + rng.uniform(-0.05, 0.05); L = int(0.08 * SR); t = np.arange(L) / SR
            i = int(t0 * SR)
            if 0 <= i < len(out) - L: out[i:i + L] += lp(rng.standard_normal(L), 600) * np.exp(-t * 60) * 0.15
    return out * env(len(out), 0.8, 1.0)
def s_river(d):
    x = bp(noise(d), 300, 2500) * 0.25 + hp(noise(d), 3000) * 0.05
    t = tt(d); return x * (0.8 + 0.2 * np.sin(2 * np.pi * 0.7 * t)) * env(len(t), 0.6, 0.8) * 0.45
def s_splash():
    t = tt(0.6); return bp(noise(0.6), 500, 5000) * np.exp(-t * 9) * 0.45
def s_pour():
    d = 2.4; t = tt(d); x = bp(noise(d), 600, 2200) * (0.6 + 0.4 * np.sin(2 * np.pi * 9 * t)) * env(len(t), 0.2, 0.4)
    return x * 0.2
def s_crowd(d):
    t = tt(d); x = np.zeros_like(t)
    for k in range(10):
        f0 = rng.uniform(300, 900); mod = 0.5 + 0.5 * np.sin(2 * np.pi * rng.uniform(1.5, 4) * t + k)
        x += bp(noise(d), f0, f0 * 1.6) * mod
    return x * env(len(t), 1.0, 1.2) * 0.06
def s_fire(d):
    out = lp(noise(d), 400) * 0.15
    for k in range(int(d * 14)):
        i = int(rng.uniform(0, d) * SR); L = 300
        if i + L < len(out): out[i:i + L] += hp(rng.standard_normal(L), 2000) * np.exp(-np.arange(L) / 40) * rng.uniform(0.1, 0.6)
    return out * env(len(out), 0.5, 0.8) * 0.3
def s_seal():
    t = tt(0.8); return (bp(noise(0.8), 2000, 8000) * np.exp(-t * 6) * 0.15 + np.sin(2 * np.pi * 90 * t) * np.exp(-t * 12) * 0.4)
def s_shout():
    # crowd crying "jin-oh!": many voices, formant-filtered, pitch falling on "oh"
    d = 1.5; t = tt(d); x = np.zeros_like(t)
    for k in range(24):
        f0 = rng.uniform(140, 260) * (1 + 0.15 * np.exp(-t * 3)); ph = 2 * np.pi * np.cumsum(f0) / SR
        v = np.sign(np.sin(ph)) * 0.3 + np.sin(ph) * 0.7
        x += v * (np.clip((t - rng.uniform(0, 0.12)) / 0.05, 0, 1))
    y = bp(x, 450, 900) * 1.0 + bp(x, 2300, 3000) * 0.4 + bp(x, 1000, 1400) * 0.4
    return y * env(len(t), 0.05, 0.6) * 0.035
def s_drumroll():
    out = np.zeros(int(2.5 * SR))
    for k in range(24):
        i = int(k * 0.08 * SR * (1 - k / 60)); d = drum(0.25 + 0.03 * k, 100); out[i:i + len(d)] += d[:len(out) - i]
    return out * 0.5

for sid, cues in CUES.items():
    st = SCN[sid]['start']
    for c in cues:
        name, t0 = c[0], st + c[1]; d = c[2] if len(c) > 2 else None
        if name == 'waves': put(sfx, s_waves(d), t0, -0.3, 0.9)
        elif name == 'gulls': put(sfx, s_gulls(), t0, 0.4)
        elif name == 'gong': put(sfx, gong(0.9, 5, 100), t0, 0.1, 0.9)
        elif name == 'stamp': put(sfx, s_stamp(), t0)
        elif name == 'jiao': put(sfx, s_jiao(1.0), t0, -0.1)
        elif name == 'jiao2': put(sfx, s_jiao(0.6), t0, 0.1)
        elif name == 'bell': put(sfx, s_bell(), t0, 0.2)
        elif name == 'firecrackers': put(sfx, s_firecrackers(d), t0, -0.4)
        elif name == 'drum': put(sfx, drum(1.0, 85), t0)
        elif name == 'drumroll': put(sfx, s_drumroll(), t0, 0.1)
        elif name == 'run': put(sfx, s_run(d), t0, 0.1)
        elif name == 'whoosh': put(sfx, s_whoosh(), t0, 0.3)
        elif name == 'river': put(sfx, s_river(d), t0)
        elif name == 'splash': put(sfx, s_splash(), t0, rng.uniform(-0.5, 0.5))
        elif name == 'pour': put(sfx, s_pour(), t0, -0.5)
        elif name == 'crowd': put(sfx, s_crowd(d - (t0 - st)), t0, 0.2)
        elif name == 'fire': put(sfx, s_fire(d), t0, -0.3)
        elif name == 'seal': put(sfx, s_seal(), t0, 0.3)
        elif name == 'shout': put(sfx, s_shout(), t0, 0.0)
        elif name == 'firework': put(sfx, s_firework(), t0, rng.uniform(-0.4, 0.6))
        else: raise SystemExit('unknown cue ' + name)

# ---------------- narration ----------------
duck = np.ones(N)
for s in TL['subs']:
    x, sr = sf.read(s['file'])
    x = resample_poly(x, SR, sr) if sr != SR else x
    i = int(s['start'] * SR); vo[i:i + len(x)] += x[:N - i]
    a, b = int((s['start'] - 0.3) * SR), int((s['start'] + len(x) / SR + 0.15) * SR)
    duck[max(0, a):b] = 0.0
# smooth duck envelope: 0 -> -10 dB for music, -5 dB for effects
k = int(0.35 * SR); ker = np.hanning(2 * k); ker /= ker.sum()
sm = fftconvolve(duck, ker, mode='same')
mus_g = 0.32 + 0.68 * sm; sfx_g = 0.55 + 0.45 * sm

# ---------------- reverb & bus ----------------
def reverb(x, secs=2.2, wet=0.25):
    t = tt(secs); ir = rng.standard_normal((len(t), 2)) * np.exp(-t * 6.9 / secs)[:, None]
    ir = lp(ir.T, 5000).T; ir /= np.sqrt((ir ** 2).sum(0))
    y = np.stack([fftconvolve(x[:, c], ir[:, c])[:len(x)] for c in range(2)], 1)
    return x * (1 - wet) + y * wet * 1.2
mus = reverb(mus, 2.4, 0.3)
sfx = reverb(sfx, 1.2, 0.12)
vo_st = np.stack([vo, vo], 1)
vo_st = vo_st / (np.abs(vo).max() + 1e-9) * 0.8
mus_rms = np.sqrt((mus ** 2).mean()); vo_rms = np.sqrt((vo_st[vo_st[:, 0] != 0] ** 2).mean())
mus *= (vo_rms * 0.55) / mus_rms
sfx *= (vo_rms * 0.5) / (np.sqrt((sfx ** 2).mean()) + 1e-9)
mix = vo_st + mus * mus_g[:, None] + sfx * sfx_g[:, None]
fade = int(1.5 * SR); mix[-fade:] *= np.linspace(1, 0, fade)[:, None]
mix /= np.abs(mix).max() / 0.9
os.makedirs('out', exist_ok=True)
sf.write('out/mix_raw.wav', mix.astype(np.float32), SR, subtype='FLOAT')
sf.write('out/music_only.wav', (mus / np.abs(mus).max() * 0.8).astype(np.float32), SR, subtype='FLOAT')
print('ok', DUR)
