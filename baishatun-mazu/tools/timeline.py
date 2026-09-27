import json
P=''
S=json.load(open(P+'script.json')); D=json.load(open('audio/vo/durations.json'))
FPS=30
def q(t): return round(t*FPS)/FPS
PRE,GAP,POST=1.4,0.8,1.6
FIXED={'s02_title':6.5,'s12_end':11.0}
t=0;k=0;scenes=[];subs=[]
for sc in S['scenes']:
  st=t
  if not sc['lines']:
    t=q(t+FIXED[sc['id']])
  else:
    t=q(t+PRE)
    for i,ln in enumerate(sc['lines']):
      d=D[k]; assert d['scene']==sc['id']
      subs.append({'n':k,'scene':sc['id'],'start':t,'end':q(t+d['dur']),'zh':ln['zh'],'en':ln['en'],'file':'audio/'+d['file']})
      t=q(t+d['dur']+(GAP if i<len(sc['lines'])-1 else 0)); k+=1
    t=q(t+POST)
  scenes.append({'id':sc['id'],'night':sc['night'],'start':st,'end':t})
tl={'fps':FPS,'duration':t,'scenes':scenes,'subs':subs,'title_zh':S['title_zh'],'title_en':S['title_en'],'sources':S['sources']}
json.dump(tl,open(P+'timeline.json','w'),ensure_ascii=False,indent=1)
for s in scenes: print(s['id'],round(s['start'],2),round(s['end']-s['start'],2))
print('total',t)
open('render/timeline.js','w').write('const TL = '+json.dumps(tl,ensure_ascii=False)+';\n')
