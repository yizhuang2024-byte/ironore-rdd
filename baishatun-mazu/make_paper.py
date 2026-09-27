# Generates a warm paper-fibre texture used as a multiply overlay.
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter
rng=np.random.default_rng(7); W,H=1920,1080
n=np.zeros((H,W))
for s,a in [(1,.35),(3,.35),(12,.5),(60,.6)]:
    n+=a*gaussian_filter(rng.standard_normal((H,W)),s)*s**.5
n=(n-n.mean())/n.std()
fib=np.zeros((H,W))
for _ in range(2500):  # short fibres
    x,y=rng.uniform(0,W),rng.uniform(0,H); ang=rng.uniform(0,np.pi); L=rng.uniform(8,40)
    for k in np.linspace(0,1,int(L)):
        xi,yi=int(x+np.cos(ang)*L*k),int(y+np.sin(ang)*L*k)
        if 0<=xi<W and 0<=yi<H: fib[yi,xi]+=1
fib=gaussian_filter(fib,.7)
v=1-0.035*n-0.08*fib
yy,xx=np.mgrid[0:H,0:W]; r=np.hypot((xx-W/2)/(W/2),(yy-H/2)/(H/2))
v*=1-0.16*np.clip(r-0.55,0,None)**1.6
v=np.clip(v,0,1)
rgb=np.stack([v*255,(v**1.05)*255,(v**1.15)*255],-1).astype(np.uint8)
Image.fromarray(rgb).save('render/paper.png')
