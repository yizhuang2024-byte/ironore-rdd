"""Frame-exact MP4 export: renders every frame (1920x1080, 30 fps) with the same anim.js,
pipes JPEG frames to ffmpeg (H.264) and muxes the ducked narration+music mix."""
import base64, json, os, subprocess, sys, time
import imageio_ffmpeg
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(__file__))
from shots import serve, ROOT

FPS = 30
out = os.path.join(ROOT, "dist", "vaccine-how-it-works-1080p.mp4")
tl = json.load(open(os.path.join(ROOT, "timeline.json"), encoding="utf-8"))
n = int(round(tl["duration"] * FPS))
ff = imageio_ffmpeg.get_ffmpeg_exe()
os.makedirs(os.path.dirname(out), exist_ok=True)
proc = subprocess.Popen([ff, "-y", "-loglevel", "error", "-f", "image2pipe", "-vcodec", "mjpeg", "-framerate", str(FPS), "-i", "-",
                         "-i", os.path.join(ROOT, "audio", "mix.wav"),
                         "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p",
                         "-profile:v", "high", "-r", str(FPS), "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", out],
                        stdin=subprocess.PIPE)
srv = serve(8766)
t0 = time.time()
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--disable-gpu"])
    pg = b.new_page(viewport={"width": 1920, "height": 1080})
    pg.goto("http://127.0.0.1:8766/render.html"); pg.wait_for_function("window.ready === true")
    pg.evaluate("""() => { window.frameJpeg = (t) => { renderAt(t); return document.getElementById('c').toDataURL('image/jpeg', 0.95).split(',')[1]; }; }""")
    for i in range(n):
        proc.stdin.write(base64.b64decode(pg.evaluate(f"frameJpeg({i / FPS})")))
        if i % 300 == 0:
            print(f"frame {i}/{n}  {time.time() - t0:.0f}s", flush=True)
    b.close()
proc.stdin.close(); proc.wait(); srv.shutdown()
print("done", out, os.path.getsize(out) // 1024, "KB", f"{time.time() - t0:.0f}s")
