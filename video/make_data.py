import json, csv
tl = json.load(open("build/timeline.json"))
rows = list(csv.DictReader(open("data/worldbank_pinksheet_iron_ore_monthly_2013_2026.csv")))
price = [[r["month"], float(r["iron_ore_cfr_spot_usd_per_dmt"])] for r in rows if r["month"] >= "2013M01"]
open("anim/data.js", "w").write("window.TL=" + json.dumps(tl, ensure_ascii=False) + ";\nwindow.PRICE=" + json.dumps(price) + ";\n")
print(len(price), price[0], price[-1])
