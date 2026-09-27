# Writes bilingual subtitles (Chinese line, then English line) matching the burned-in timing.
import json
TL = json.load(open('timeline.json'))
def ts(t):
    ms = int(round(t * 1000)); h, ms = divmod(ms, 3600000); m, ms = divmod(ms, 60000); s, ms = divmod(ms, 1000)
    return f'{h:02d}:{m:02d}:{s:02d},{ms:03d}'
with open('out/baishatun_mazu.srt', 'w', encoding='utf-8') as f:
    for i, s in enumerate(TL['subs'], 1):
        f.write(f"{i}\n{ts(s['start'] - 0.15)} --> {ts(s['end'] + 0.35)}\n{s['zh']}\n<i>{s['en']}</i>\n\n")
