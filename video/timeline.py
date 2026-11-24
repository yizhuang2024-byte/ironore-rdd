"""Build the master timeline from measured narration durations.
Every scene length is derived from the real TTS seconds so picture, subtitles and voice stay in sync."""
import json
s = json.load(open("script.json"))
dur = {int(k): v for k, v in json.load(open("build/tts/durations.json")).items()}
ORDER = ["open", "title", "history", "discovery", "production", "price", "cyclone", "future", "closing", "end"]
LEAD = {"open": 1.6, "closing": 1.4}           # silence before first line of scene
TAIL = {"open": 0.9, "closing": 2.6}           # silence after last line of scene
GAP = 0.65                                     # silence between lines
FIXED = {"title": 5.2, "end": 10.0}            # scenes with no narration
t = 0.0
scenes, lines = [], []
for name in ORDER:
    start = t
    if name in FIXED:
        t += FIXED[name]
    else:
        t += LEAD.get(name, 1.1)
        ls = [l for l in s["lines"] if l["scene"] == name]
        for i, l in enumerate(ls):
            d = dur[l["id"]]
            lines.append({"id": l["id"], "scene": name, "start": round(t, 3), "end": round(t + d, 3),
                          "zh": l["sub"], "en": l["en"], "src": l["src"]})
            t += d + (GAP if i < len(ls) - 1 else 0)
        t += TAIL.get(name, 1.0)
    scenes.append({"name": name, "start": round(start, 3), "end": round(t, 3)})
total = round(t, 3)
json.dump({"fps": 30, "width": 1920, "height": 1080, "total": total, "scenes": scenes, "lines": lines,
           "title": [s["title_zh"], s["subtitle_zh"], s["title_en"], s["subtitle_en"]]},
          open("build/timeline.json", "w"), ensure_ascii=False, indent=1)
for sc in scenes: print(f"{sc['name']:11s} {sc['start']:7.2f} → {sc['end']:7.2f}  ({sc['end']-sc['start']:.2f}s)")
print("TOTAL", total, "s =", int(total // 60), "min", round(total % 60, 1), "s;", round(total * 30), "frames")

def ts(x):
    ms = round(x * 1000); h, ms = divmod(ms, 3600000); m, ms = divmod(ms, 60000); sec, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{sec:02d},{ms:03d}"
with open("build/ironore_story.srt", "w", encoding="utf-8") as f:
    for i, l in enumerate(lines, 1):
        f.write(f"{i}\n{ts(l['start'])} --> {ts(l['end'] + 0.25)}\n{l['zh']}\n{l['en']}\n\n")
