# contact sheet: python3 tools/sheet.py out.png cols a.png b.png ...
import sys; from PIL import Image, ImageDraw
out,cols=sys.argv[1],int(sys.argv[2]); fs=sys.argv[3:]; W,H=640,360
rows=(len(fs)+cols-1)//cols; sh=Image.new('RGB',(W*cols,H*rows),'white'); d=ImageDraw.Draw(sh)
for i,f in enumerate(fs):
    x,y=(i%cols)*W,(i//cols)*H; sh.paste(Image.open(f).convert('RGB').resize((W,H)),(x,y)); d.text((x+6,y+4),f.split('/')[-1],fill='red')
sh.save(out)
