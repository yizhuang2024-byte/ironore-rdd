# Frame-by-frame check of the final video: decodes every frame (downscaled) and flags
# blank frames, sudden jumps not at scene cuts, and frozen stretches.
import subprocess, json, sys, numpy as np, imageio_ffmpeg
FF = imageio_ffmpeg.get_ffmpeg_exe(); src = sys.argv[1]
TL = json.load(open('timeline.json')); w, h = 192, 108
p = subprocess.Popen([FF, '-loglevel', 'error', '-i', src, '-vf', f'scale={w}:{h}', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], stdout=subprocess.PIPE)
frames = []
while True:
    b = p.stdout.read(w * h)
    if len(b) < w * h: break
    frames.append(np.frombuffer(b, np.uint8).reshape(h, w).astype(np.float32))
F = np.stack(frames); n = len(F)
cuts = {round(s['start'] * 30) for s in TL['scenes']}
near_cut = lambda i: any(abs(i - c) <= 16 for c in cuts)
mean, std = F.mean((1, 2)), F.std((1, 2))
diff = np.abs(np.diff(F, axis=0)).mean((1, 2))
issues = []
for i in range(n):
    if std[i] < 4 and not near_cut(i): issues.append((i, 'near-empty frame', round(float(std[i]), 2)))
for i, d in enumerate(diff):
    if d > 12 and not near_cut(i + 1): issues.append((i + 1, 'sudden jump', round(float(d), 2)))
still = 0
for i, d in enumerate(diff):
    still = still + 1 if d < 0.02 else 0
    if still == 45: issues.append((i + 1, 'frozen 1.5s', 0))
print(json.dumps({'frames': n, 'expected': round(TL['duration'] * 30), 'mean_luma': [round(float(mean.min()), 1), round(float(mean.max()), 1)],
                  'max_diff_off_cut': round(float(max([d for i, d in enumerate(diff) if not near_cut(i + 1)])), 2), 'issues': issues[:40], 'n_issues': len(issues)}, indent=1))
