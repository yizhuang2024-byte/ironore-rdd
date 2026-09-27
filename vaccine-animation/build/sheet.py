import sys, glob, os
from PIL import Image
files = sorted(glob.glob(os.path.join(sys.argv[1], "t*.jpg")))
out = sys.argv[2]; per = 6
for n in range(0, len(files), per):
    ims = [Image.open(f).resize((960, 540)) for f in files[n:n + per]]
    sheet = Image.new("RGB", (1920, 540 * ((len(ims) + 1) // 2)))
    for i, im in enumerate(ims): sheet.paste(im, ((i % 2) * 960, (i // 2) * 540))
    sheet.save(f"{out}_{n // per}.jpg", quality=85)
