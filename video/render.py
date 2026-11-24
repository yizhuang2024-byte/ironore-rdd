"""Deterministic frame renderer.
  python3.13 render.py stills t1 t2 ...         → build/stills/t_XXX.png
  python3.13 render.py video [workers]          → build/frames_*.mp4 segments, then build/video_noaudio.mp4
Every frame is fully painted (fonts ready + 2 animation frames) before it is captured."""
import asyncio, json, os, subprocess, sys, pathlib
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent
PAGE = (ROOT / "anim" / "index.html").as_uri()
TL = json.load(open(ROOT / "build" / "timeline.json"))
FPS, TOTAL = TL["fps"], TL["total"]
NFRAMES = round(TOTAL * FPS)
CHROME = "/opt/pw-browsers/chromium"


async def open_page(pw):
    exe = None
    for cand in pathlib.Path("/opt/pw-browsers").glob("chromium-*/chrome-linux*/chrome"):
        exe = str(cand)
    browser = await pw.chromium.launch(executable_path=exe, args=["--allow-file-access-from-files", "--disable-gpu", "--font-render-hinting=none"])
    page = await browser.new_page(viewport={"width": 1920, "height": 1080}, device_scale_factor=1)
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    await page.goto(PAGE)
    info = await page.evaluate("init()")
    return browser, page, errors, info


async def stills(times):
    out = ROOT / "build" / "stills"; out.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as pw:
        browser, page, errors, info = await open_page(pw)
        print("init", info)
        for t in times:
            await page.evaluate(f"renderFrame({t})")
            await page.screenshot(path=str(out / f"t_{t:07.2f}.png"))
        if errors: print("ERRORS:", errors[:10])
        await browser.close()


async def segment(k, a, b):
    """render frames [a, b) to an intermediate lossless-ish segment"""
    path = ROOT / "build" / f"seg_{k:02d}.mp4"
    ff = subprocess.Popen(["ffmpeg", "-y", "-v", "error", "-f", "image2pipe", "-framerate", str(FPS), "-c:v", "png", "-i", "-",
                           "-c:v", "libx264", "-preset", "medium", "-crf", "14", "-pix_fmt", "yuv420p", str(path)], stdin=subprocess.PIPE)
    async with async_playwright() as pw:
        browser, page, errors, _ = await open_page(pw)
        for f in range(a, b):
            n = await page.evaluate(f"renderFrame({f / FPS})")
            assert n > 0, f"empty frame {f}"
            png = await page.screenshot(type="png")
            ff.stdin.write(png)
            if (f - a) % 150 == 0: print(f"[seg {k}] frame {f}/{b}", flush=True)
        await browser.close()
    ff.stdin.close(); ff.wait()
    if errors: print(f"[seg {k}] page errors:", errors[:5])
    return path


async def video(workers):
    step = -(-NFRAMES // workers)
    ranges = [(k, k * step, min(NFRAMES, (k + 1) * step)) for k in range(workers)]
    paths = await asyncio.gather(*(segment(*r) for r in ranges))
    lst = ROOT / "build" / "segments.txt"
    lst.write_text("".join(f"file '{p}'\n" for p in paths))
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(ROOT / "build" / "video_noaudio.mp4")], check=True)
    print("frames", NFRAMES)


if __name__ == "__main__":
    if sys.argv[1] == "stills":
        asyncio.run(stills([float(x) for x in sys.argv[2:]]))
    else:
        asyncio.run(video(int(sys.argv[2]) if len(sys.argv) > 2 else 4))
