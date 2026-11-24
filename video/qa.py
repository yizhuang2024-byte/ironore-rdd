"""Frame-by-frame QA on the finished video.
Checks every frame for: blank/flat frames, unexpected brightness, and abrupt jumps
that do not coincide with an intentional event (scene cross-fades, lightning flashes).
Also extracts one representative still per scene into build/qa/."""
import json, subprocess, sys, numpy as np, pathlib

ROOT = pathlib.Path(__file__).resolve().parent
VID = sys.argv[1] if len(sys.argv) > 1 else str(ROOT / "output" / "ironore_story.mp4")
TL = json.load(open(ROOT / "build" / "timeline.json"))
W, H, FPS = 240, 135, TL["fps"]

raw = subprocess.run(["ffmpeg", "-v", "error", "-i", VID, "-vf", f"scale={W}:{H}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                     capture_output=True, check=True).stdout
fr = np.frombuffer(raw, np.uint8).reshape(-1, H, W, 3).astype(np.float32)
n = len(fr)
lum = fr.mean(axis=3)
mean, std = lum.mean(axis=(1, 2)), lum.std(axis=(1, 2))
diff = np.r_[0, np.abs(np.diff(lum, axis=0)).mean(axis=(1, 2))]

bounds = [s["start"] for s in TL["scenes"][1:]]
cyc = next(s for s in TL["scenes"] if s["name"] == "cyclone")
flashes = [cyc["start"] + x for x in (3.1, 9.4, 15.8, 22.2, 27.0)]
def explained(t):
    return any(abs(t - b) < 0.6 for b in bounds) or any(abs(t - f) < 0.3 for f in flashes) or t < 0.6

problems = []
for i in range(n):
    t = i / FPS
    if std[i] < 4.0: problems.append((i, t, f"flat frame (std {std[i]:.1f})"))
    if mean[i] < 8 or mean[i] > 250: problems.append((i, t, f"extreme brightness {mean[i]:.0f}"))
    if diff[i] > 18 and not explained(t): problems.append((i, t, f"jump {diff[i]:.1f}"))
# robust spike test: compare with the local median motion
med = np.array([np.median(diff[max(0, i - 15):i + 15]) for i in range(n)])
for i in range(1, n - 1):
    t = i / FPS
    if diff[i] > 6 * med[i] + 4 and diff[i + 1] > 6 * med[i] + 4 and not explained(t):
        problems.append((i, t, f"one-frame glitch (diff {diff[i]:.1f} vs local {med[i]:.1f})"))

print(f"frames decoded: {n}  (expected {round(TL['total'] * FPS)})")
print(f"luma mean range {mean.min():.0f}–{mean.max():.0f}, min std {std.min():.1f}, max diff {diff.max():.1f}")
print("problems:", len(problems))
for p in problems[:40]: print("  frame %5d  t=%7.2fs  %s" % p)

out = ROOT / "build" / "qa"; out.mkdir(parents=True, exist_ok=True)
for s in TL["scenes"]:
    ls = [l for l in TL["lines"] if l["scene"] == s["name"]]
    t = (ls[-1]["start"] + ls[-1]["end"]) / 2 if ls else (s["start"] + s["end"]) / 2
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{t:.2f}", "-i", VID, "-frames:v", "1", str(out / f"{s['name']}.png")], check=True)
json.dump({"frames": n, "problems": problems}, open(out / "qa_report.json", "w"), indent=1)
