import json, sys, numpy as np
from PIL import Image, ImageDraw
E=json.load(open('elev_grids.json')); O=json.load(open('osm_greens.json')); P=json.load(open('pins.json'))
c=sys.argv[1]; S=8; tiles=[]
for hk in map(str,range(1,19)):
    if hk not in E[c]: continue
    g=E[c][hk]; w,h=g['w'],g['h']; z=np.array(g['z_cm']).reshape(h,w)
    minx,miny,maxx,maxy=g['bbox']
    px=lambda x,y:((x-minx)/(maxx-minx)*w*S,(maxy-y)/(maxy-miny)*h*S)
    mx,my=P[c][hk]['mid']; cx=int((mx-minx)/(maxx-minx)*w); cy=int((maxy-my)/(maxy-miny)*h)
    zp=z[min(cy,h-1),min(cx,w-1)]
    im=Image.new('RGB',(w*S,h*S)); d=ImageDraw.Draw(im)
    for r in range(h):
        for q in range(w):
            dz=zp-z[r,q]; t=min(1,abs(dz)/40)
            col=(60,170,80) if abs(dz)<5 else ((int(150+105*t),60,60) if dz>0 else (60,90,int(150+105*t)))
            d.rectangle([q*S,r*S,q*S+S-1,r*S+S-1],fill=col)
    d.line([px(*p) for p in O[c][hk]['ring']],fill=(255,255,255),width=2)
    X,Y=px(mx,my); d.ellipse([X-4,Y-4,X+4,Y+4],fill=(255,255,0)); d.text((3,3),hk+f" {g['relief_cm']}cm",fill=(255,255,255))
    tiles.append(im)
W=max(t.width for t in tiles); H=max(t.height for t in tiles)
sheet=Image.new('RGB',(W*6,H*3),(20,20,20))
for i,t in enumerate(tiles): sheet.paste(t,((i%6)*W,(i//6)*H))
sheet.thumbnail((1800,1800)); sheet.save(f'check_{c}.png')
