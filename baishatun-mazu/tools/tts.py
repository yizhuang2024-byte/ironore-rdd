import sherpa_onnx, soundfile as sf, json, numpy as np, os
P=''
S=json.load(open(P+'script.json'))
d=os.environ.get('KOKORO','kokoro-multi-lang-v1_0')+'/'
cfg=sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(kokoro=sherpa_onnx.OfflineTtsKokoroModelConfig(model=d+'model.onnx',voices=d+'voices.bin',tokens=d+'tokens.txt',data_dir=d+'espeak-ng-data',dict_dir=d+'dict',lexicon=d+'lexicon-us-en.txt,'+d+'lexicon-zh.txt'),num_threads=4),rule_fsts=d+'date-zh.fst,'+d+'phone-zh.fst,'+d+'number-zh.fst')
tts=sherpa_onnx.OfflineTts(cfg)
os.makedirs('audio/vo',exist_ok=True)
out=[];n=0
for sc in S['scenes']:
  for ln in sc['lines']:
    assert len(ln['zh'])<=30,(ln['zh'],len(ln['zh']))
    a=tts.generate(ln.get('tts',ln['zh']),sid=49,speed=0.92)
    x=np.array(a.samples,dtype=np.float32); sr=a.sample_rate
    # trim silence
    thr=0.01*np.abs(x).max(); idx=np.where(np.abs(x)>thr)[0]
    x=x[max(0,idx[0]-int(.03*sr)):idx[-1]+int(.08*sr)]
    fn=f'audio/vo/{n:02d}.wav'; sf.write(fn,x,sr)
    out.append({'n':n,'scene':sc['id'],'file':fn.replace('audio/',''),'dur':len(x)/sr,'sr':sr,'len':len(ln['zh'])}); n+=1
    print(n,len(ln['zh']),round(len(x)/sr,2),ln['zh'])
json.dump(out,open('audio/vo/durations.json','w'),indent=1)
print('total',sum(o['dur'] for o in out))
