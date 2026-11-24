import asyncio, ssl, json, subprocess, sys
import edge_tts, edge_tts.communicate as c
c._SSL_CTX = ssl.create_default_context(cafile="/root/.ccr/ca-bundle.crt")
s = json.load(open("script.json"))
async def one(l):
    mp3 = f"build/tts/{l['id']:02d}.mp3"
    for attempt in range(4):
        try:
            await edge_tts.Communicate(l["zh"], s["voice"], rate="-6%", pitch="+0Hz").save(mp3); break
        except Exception as e:
            print("retry", l["id"], e); await asyncio.sleep(2**attempt)
    wav = mp3.replace(".mp3", ".wav")
    # trim leading/trailing silence, 48k mono
    subprocess.run(["ffmpeg","-y","-v","error","-i",mp3,"-af",
        "silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse",
        "-ar","48000","-ac","1",wav],check=True)
    d = float(subprocess.check_output(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",wav]))
    return l["id"], d
async def main():
    res = []
    for l in s["lines"]:
        res.append(await one(l))
    json.dump(dict(res), open("build/tts/durations.json","w"), indent=1)
    for i,d in res: print(i, round(d,2))
    print("total", round(sum(d for _,d in res),2))
asyncio.run(main())
