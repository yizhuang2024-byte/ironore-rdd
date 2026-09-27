"""Screenshot sampled moments of every chapter for visual QA."""
import json, os, sys, threading, http.server, functools
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def serve(port=8765):
    h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    h.log_message = lambda *a: None
    s = http.server.ThreadingHTTPServer(("127.0.0.1", port), h); threading.Thread(target=s.serve_forever, daemon=True).start(); return s
if __name__ == "__main__":
    srv = serve()
    tl = json.load(open(os.path.join(ROOT, "timeline.json"), encoding="utf-8"))
    times = [float(x) for x in sys.argv[1:]]
    if not times:
        for ch in tl["chapters"]:
            d = ch["end"] - ch["start"]
            times += [round(ch["start"] + d * f, 2) for f in (0.3, 0.62, 0.93)]
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--disable-gpu"])
        pg = b.new_page(viewport={"width": 1920, "height": 1080})
        errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto("http://127.0.0.1:8765/render.html"); pg.wait_for_function("window.ready === true")
        os.makedirs(os.path.join(ROOT, "shots"), exist_ok=True)
        for t in times:
            pg.evaluate(f"renderAt({t})")
            pg.locator("#c").screenshot(path=os.path.join(ROOT, "shots", f"t{t:06.2f}.jpg"))
        print("errors:", errs)
        b.close()
    srv.shutdown()
