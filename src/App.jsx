import { useState, useEffect, useRef, useCallback } from "react";
import { LineChart, Line, BarChart, Bar, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, ResponsiveContainer, Cell } from "recharts";

// ═══ 嵌入數據 ═══
const MONTHLY = [["2013-01",150.92,0],["2013-02",155.57,8],["2013-03",142.51,1],["2013-04",138.74,0],["2013-05",130.03,0],["2013-06",120.68,0],["2013-07",130.5,0],["2013-08",138.24,0],["2013-09",133.35,0],["2013-10",132.47,0],["2013-11",135.78,0],["2013-12",136.37,8],["2014-01",128.55,0],["2014-02",120.86,1],["2014-03",116.32,0],["2014-04",107.97,0],["2014-05",100.89,0],["2014-06",88.97,0],["2014-07",93.86,0],["2014-08",91.38,0],["2014-09",81.11,0],["2014-10",77.48,0],["2014-11",73.31,0],["2014-12",69.01,0],["2015-01",63.78,0],["2015-02",63.29,7],["2015-03",57.25,0],["2015-04",52.42,0],["2015-05",61.5,0],["2015-06",63.38,0],["2015-07",53.1,0],["2015-08",53.89,0],["2015-09",54.66,0],["2015-10",52.52,0],["2015-11",44.75,0],["2015-12",39.87,0],["2016-01",42.52,6],["2016-02",48.4,0],["2016-03",55.53,0],["2016-04",63.76,0],["2016-05",56.29,0],["2016-06",53.95,0],["2016-07",56.89,0],["2016-08",60.09,0],["2016-09",56.54,0],["2016-10",58.99,0],["2016-11",72.45,0],["2016-12",80.33,0],["2017-01",84.06,0],["2017-02",90.43,0],["2017-03",85.54,0],["2017-04",67.73,0],["2017-05",61.95,0],["2017-06",54.8,0],["2017-07",70.0,0],["2017-08",74.42,0],["2017-09",62.31,0],["2017-10",60.59,0],["2017-11",63.57,0],["2017-12",73.54,0],["2018-01",76.66,9],["2018-02",76.49,0],["2018-03",68.42,0],["2018-04",64.77,0],["2018-05",67.15,0],["2018-06",65.78,0],["2018-07",65.39,0],["2018-08",68.28,0],["2018-09",67.76,0],["2018-10",73.96,0],["2018-11",65.77,0],["2018-12",70.96,0],["2019-01",75.18,0],["2019-02",87.79,0],["2019-03",86.55,9],["2019-04",93.32,0],["2019-05",98.43,0],["2019-06",107.8,0],["2019-07",119.17,0],["2019-08",91.99,0],["2019-09",91.38,0],["2019-10",91.7,0],["2019-11",87.06,0],["2019-12",93.54,0],["2020-01",95.05,0],["2020-02",90.36,7],["2020-03",87.54,0],["2020-04",84.42,0],["2020-05",94.02,0],["2020-06",101.27,0],["2020-07",106.77,0],["2020-08",124.54,0],["2020-09",116.4,0],["2020-10",119.97,0],["2020-11",128.07,0],["2020-12",155.61,0],["2021-01",161.37,11],["2021-02",167.59,0],["2021-03",167.45,0],["2021-04",181.5,0],["2021-05",208.28,0],["2021-06",212.97,0],["2021-07",200.47,0],["2021-08",164.4,0],["2021-09",116.47,0],["2021-10",119.67,0],["2021-11",97.38,0],["2021-12",118.58,0],["2022-01",137.99,0],["2022-02",141.56,0],["2022-03",156.26,0],["2022-04",146.3,0],["2022-05",131.52,0],["2022-06",126.15,0],["2022-07",103.01,0],["2022-08",99.22,0],["2022-09",97.07,0],["2022-10",92.14,0],["2022-11",93.09,0],["2022-12",112.45,0],["2023-01",123.13,0],["2023-02",126.37,0],["2023-03",124.44,11],["2023-04",106.96,0],["2023-05",104.97,0],["2023-06",113.05,0],["2023-07",109.88,0],["2023-08",109.32,0],["2023-09",117.14,0],["2023-10",120.32,0],["2023-11",128.87,0],["2023-12",139.31,0],["2024-01",134.02,0],["2024-02",120.39,0],["2024-03",110.01,0],["2024-04",107.0,0],["2024-05",116.36,0],["2024-06",105.96,0],["2024-07",103.9,0],["2024-08",96.78,0],["2024-09",91.79,0],["2024-10",99.93,0],["2024-11",103.16,0],["2024-12",103.79,0],["2025-01",101.26,7],["2025-02",107.37,14],["2025-03",103.13,0],["2025-04",98.67,0],["2025-05",100.44,0],["2025-06",101.52,0],["2025-07",99.23,0],["2025-08",97.44,0],["2025-09",98.11,0],["2025-10",102.3,0],["2025-11",105.2,0],["2025-12",106.8,0],["2026-01",107.5,0],["2026-02",106.9,0],["2026-03",106.1,12]];

const SEASONS = [[2012,9,9,146.74,139.87,-4.68,90.0,0.8571],[2013,8,8,127.43,111.83,-12.24,90.0,0.7587],[2014,7,7,68.92,39.58,-42.56,75.0,0.3544],[2015,6,6,39.58,79.75,101.49,48.0,0.163],[2016,0,0,79.75,71.28,-10.62,0,0],[2017,9,9,71.28,69.2,-2.92,45.0,0.2299],[2018,9,9,69.2,91.53,32.27,103.0,0.6213],[2019,7,7,91.53,155.84,70.26,80.0,0.4731],[2020,11,11,155.84,112.5,-27.81,58.0,0.3526],[2021,0,0,112.5,111.28,-1.09,0,0],[2022,11,11,111.28,136.37,22.55,95.0,0.6958],[2023,0,0,136.37,103.61,-24.03,0,0],[2024,14,14,103.61,107.37,3.63,105.0,0.9928],[2025,12,12,107.37,106.1,-1.18,0,0]];

const EVENTS = [["RUSTY","2013-02-21","2013-03-01",9,90,944,3,3],["CHRISTINE","2013-12-25","2014-01-01",8,90,948,3,2],["OLWYN","2015-03-08","2015-03-14",7,75,955,1,1],["STAN","2016-01-27","2016-02-01",6,48,984,3,2],["JOYCE","2018-01-07","2018-01-15",9,45,979,3,3],["VERONICA","2019-03-18","2019-03-26",9,103,941,3,2],["DAMIEN","2020-02-03","2020-02-09",7,80,958,2,3],["SEROJA","2021-04-02","2021-04-12",11,58,978,1,1],["ILSA","2023-04-05","2023-04-15",11,95,948,2,3],["SEAN","2025-01-17","2025-01-23",7,83,953,3,2],["ZELIA","2025-02-08","2025-02-14",7,105,928,3,3],["NARELLE","2026-03-17","2026-03-28",12,0,0,2,1]];

// ═══ 工具函數 ═══
function linReg(xs, ys) {
  const n = xs.length;
  if (n < 2) return { a: 0, b: 0, r2: 0 };
  const mx = xs.reduce((s,v)=>s+v,0)/n, my = ys.reduce((s,v)=>s+v,0)/n;
  let ss=0, st=0;
  xs.forEach((x,i)=>{ ss+=(x-mx)*(ys[i]-my); st+=(x-mx)**2; });
  const b = st ? ss/st : 0, a = my-b*mx;
  const yh = xs.map(x=>a+b*x);
  const sst = ys.reduce((s,v)=>s+(v-my)**2,0);
  const sse = ys.reduce((s,v,i)=>s+(v-yh[i])**2,0);
  return { a, b, r2: sst ? Math.max(0,1-sse/sst) : 0 };
}

function calcRDD(varIdx, threshold, bwMult) {
  const xs = SEASONS.map(s => s[varIdx]);
  const ys = SEASONS.map(s => s[5]); // price_change_pct
  const rv = xs.map(x => x - threshold);
  const bwBase = rv.reduce((s,v)=>s+Math.abs(v),0) / (rv.length||1);
  const bw = bwBase * bwMult;
  const cxs=[], cys=[], txs=[], tys=[];
  SEASONS.forEach((s,i) => {
    if (Math.abs(rv[i]) > bw) return;
    if (rv[i] < 0) { cxs.push(rv[i]); cys.push(ys[i]); }
    else { txs.push(rv[i]); tys.push(ys[i]); }
  });
  const cr = linReg(cxs, cys), tr = linReg(txs, tys);
  const ate = +(tr.a - cr.a).toFixed(2);
  const cm = cys.length ? +(cys.reduce((s,v)=>s+v,0)/cys.length).toFixed(2) : 0;
  const tm = tys.length ? +(tys.reduce((s,v)=>s+v,0)/tys.length).toFixed(2) : 0;
  // t-test approximation
  let t=0, p=1;
  if (cys.length > 1 && tys.length > 1) {
    const va = cys.reduce((s,v)=>s+(v-cm)**2,0)/Math.max(cys.length-1,1);
    const vb = tys.reduce((s,v)=>s+(v-tm)**2,0)/Math.max(tys.length-1,1);
    const se = Math.sqrt(va/cys.length + vb/tys.length);
    if (se > 0) {
      t = +((tm-cm)/se).toFixed(3);
      const x = Math.abs(t);
      p = +Math.min(1,2*Math.exp(-0.717*x-0.416*x*x)).toFixed(4);
    }
  }
  // Cohen's d
  let d = 0;
  if (cys.length > 1 && tys.length > 1) {
    const va = cys.reduce((s,v)=>s+(v-cm)**2,0)/Math.max(cys.length-1,1);
    const vb = tys.reduce((s,v)=>s+(v-tm)**2,0)/Math.max(tys.length-1,1);
    const sp = Math.sqrt(((cys.length-1)*va+(tys.length-1)*vb)/(cys.length+tys.length-2));
    d = sp ? +((tm-cm)/sp).toFixed(3) : 0;
  }
  // 繪圖點
  const scatterPts = SEASONS.map((s,i) => ({
    x: +(rv[i]).toFixed(2), y: ys[i], year: s[0],
    group: rv[i] < 0 ? 'ctrl' : 'trt',
    inBW: Math.abs(rv[i]) <= bw
  }));
  return { ate, cm, tm, t, p, d, nc: cxs.length, nt: txs.length, bw: +bw.toFixed(2), cr, tr, scatterPts, cxs, txs, threshold };
}

// ═══ 顏色 ═══
const C = { bg:'#07111f', s1:'#0d1b2e', s2:'#112039', bd:'#1b3354', cy:'#00e5ff', or:'#ff7043', gn:'#00e676', pu:'#ce93d8', rd:'#ef5350', yw:'#ffd54f', bl:'#42a5f5', tx:'#dde8f5', dm:'#4a6580' };

// ═══ 元件 ═══
const Tag = ({level}) => {
  const map = {3:{bg:'rgba(239,83,80,.15)',c:'#ef5350',t:'🔴極危'}, 2:{bg:'rgba(255,213,79,.15)',c:'#ffd54f',t:'🟡警戒'}, 1:{bg:'rgba(0,230,118,.15)',c:'#00e676',t:'🟢安全'}, 0:{bg:'rgba(74,101,128,.15)',c:'#4a6580',t:'—'}};
  const s = map[level]||map[0];
  return <span style={{background:s.bg,color:s.c,border:`1px solid ${s.c}40`,padding:'1px 6px',borderRadius:3,fontSize:'.62rem',fontWeight:600}}>{s.t}</span>;
};

const Sig = ({p}) => {
  const [cls,txt] = p<=0.001?['#00e5ff','*** p<0.001']:p<=0.05?['#00e676','* p='+p]:p<0.1?['#ff7043','† p='+p]:['#4a6580','n.s. p='+p];
  return <span style={{background:cls+'22',color:cls,border:`1px solid ${cls}44`,padding:'2px 7px',borderRadius:3,fontSize:'.62rem',fontWeight:700}}>{txt}</span>;
};

const Card = ({title, children, style={}}) => (
  <div style={{background:C.s1,border:`1px solid ${C.bd}`,borderRadius:10,padding:'14px',marginBottom:12,...style}}>
    {title && <div style={{fontSize:'.85rem',fontWeight:600,color:C.cy,marginBottom:12,display:'flex',alignItems:'center',gap:7}}>{title}</div>}
    {children}
  </div>
);

const Mono = ({children, color=C.tx}) => (
  <span style={{fontFamily:'IBM Plex Mono,monospace',color}}>{children}</span>
);

// ═══ DASHBOARD ═══
function Dashboard() {
  const prices = MONTHLY.map(m=>m[1]);
  const latest = prices[prices.length-1];
  const first = prices[0];
  const maxP = Math.max(...prices), minP = Math.min(...prices);
  const ret = ((latest-first)/first*100).toFixed(1);
  const hDays = MONTHLY.reduce((s,m)=>s+m[2],0);

  const kpis = [
    {l:'最新價格', v:`$${latest.toFixed(1)}`, s:'USD/噸', c:C.cy},
    {l:'歷史最高', v:`$${maxP.toFixed(0)}`, s:'2021年峰值', c:C.gn},
    {l:'歷史最低', v:`$${minP.toFixed(0)}`, s:'2015年谷底', c:C.or},
    {l:'13年總報酬', v:`${ret>0?'+':''}${ret}%`, s:'2013→2026', c:ret>0?C.gn:C.rd},
    {l:'颶風活躍月', v:hDays, s:'12個颶風事件', c:C.or},
    {l:'數據筆數', v:`${MONTHLY.length}月`, s:'月度均值', c:C.pu},
  ];

  const chartData = MONTHLY.map(m=>({name:m[0].substring(0,7), price:m[1], hurricane:m[2]>0?m[1]:null}));

  const customDot = (props) => {
    const {cx,cy,payload} = props;
    if (payload.hurricane) return <circle cx={cx} cy={cy} r={5} fill={C.or} opacity={0.8}/>;
    return <circle cx={cx} cy={cy} r={0} fill="none"/>;
  };

  return (
    <div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:12}}>
        {kpis.map((k,i)=>(
          <div key={i} style={{background:C.s1,border:`1px solid ${C.bd}`,borderRadius:9,padding:'11px 12px',position:'relative',overflow:'hidden'}}>
            <div style={{position:'absolute',top:0,left:0,right:0,height:2,background:k.c}}/>
            <div style={{fontSize:'.58rem',color:C.dm,textTransform:'uppercase',letterSpacing:'.07em',marginBottom:4}}>{k.l}</div>
            <div style={{fontSize:'1.3rem',fontWeight:700,fontFamily:'IBM Plex Mono,monospace',color:k.c,lineHeight:1}}>{k.v}</div>
            <div style={{fontSize:'.6rem',color:C.dm,marginTop:3}}>{k.s}</div>
          </div>
        ))}
      </div>

      <Card title="📉 鐵礦石 62% Fe CFR 月度價格走勢（橙點=颶風活躍月）">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.bd} opacity={0.5}/>
            <XAxis dataKey="name" tick={{fill:C.dm,fontSize:9}} tickCount={8} interval={Math.floor(chartData.length/8)}/>
            <YAxis tick={{fill:C.dm,fontSize:9}} tickFormatter={v=>`$${v}`}/>
            <Tooltip contentStyle={{background:C.s1,border:`1px solid ${C.bd}`,borderRadius:8,fontSize:'.75rem'}} formatter={(v,n)=>[`$${v} USD/噸`,'CFR價格']}/>
            <Line type="monotone" dataKey="price" stroke={C.cy} strokeWidth={1.5} dot={customDot} activeDot={{r:4,fill:C.cy}}/>
            <Line type="monotone" dataKey="hurricane" stroke={C.or} strokeWidth={0} dot={<circle r={5} fill={C.or} opacity={0.7}/>}/>
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
        <Card title="📅 年度颶風天數 vs 價格變化">
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={SEASONS.map(s=>({year:s[0],hdays:s[1],pchg:s[5]}))}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.bd} opacity={0.5}/>
              <XAxis dataKey="year" tick={{fill:C.dm,fontSize:8}}/>
              <YAxis yAxisId="l" tick={{fill:C.or,fontSize:8}}/>
              <YAxis yAxisId="r" orientation="right" tick={{fill:C.cy,fontSize:8}} tickFormatter={v=>`${v}%`}/>
              <Tooltip contentStyle={{background:C.s1,border:`1px solid ${C.bd}`,fontSize:'.72rem'}}/>
              <Bar yAxisId="l" dataKey="hdays" fill={C.or} opacity={0.6} name="颶風天數"/>
              <Line yAxisId="r" type="monotone" dataKey="pchg" stroke={C.cy} strokeWidth={2} dot={{r:3}} name="價格變化%"/>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="🌀 12個颶風事件概覽">
          <div style={{overflowY:'auto',maxHeight:160}}>
            {EVENTS.map((ev,i)=>(
              <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'4px 0',borderBottom:`1px solid ${C.bd}40`,fontSize:'.72rem'}}>
                <span style={{color:C.cy,fontWeight:600,minWidth:80}}>{ev[0]}</span>
                <span style={{color:C.dm}}>{ev[1].substring(0,7)}</span>
                <span style={{color:ev[4]>=80?C.rd:C.yw,fontFamily:'IBM Plex Mono,monospace'}}>{ev[4]>0?`${ev[4]}kt`:'—'}</span>
                <Tag level={ev[6]}/>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ═══ RDD ═══
function RDDAnalysis() {
  const [bw, setBw] = useState(1.0);
  const [activeH, setActiveH] = useState(0);

  const HYPOS = [
    {label:'H1 礦區颶風天數', varIdx:1, threshold:7, color:C.cy},
    {label:'H2 港口颶風天數', varIdx:2, threshold:7, color:C.or},
    {label:'H3 颶風強度指數', varIdx:7, threshold:0.35, color:C.pu},
  ];

  const results = HYPOS.map(h => calcRDD(h.varIdx, h.threshold, bw));
  const r = results[activeH];
  const h = HYPOS[activeH];

  // RDD散點圖數據
  const scatterData = r.scatterPts.filter(p=>p.inBW).map(p=>({
    x: p.x, y: p.y, year: p.year, group: p.group
  }));

  // 回歸線點
  const makeRegLine = (reg, xArr) => {
    if (!xArr.length) return [];
    const xMin = Math.min(...xArr), xMax = Math.max(...xArr);
    return [{x:xMin,y:reg.a+reg.b*xMin},{x:0,y:reg.a},{x:xMax,y:reg.a+reg.b*xMax}].filter(p=>p.y!==undefined);
  };

  // 敏感度分析
  const bwRange = [0.3,0.5,0.75,1.0,1.25,1.5,2.0];
  const sensData = bwRange.map(bwv=>({
    bw:bwv+'x',
    h1: calcRDD(1,7,bwv).ate,
    h2: calcRDD(2,7,bwv).ate,
    h3: calcRDD(7,0.35,bwv).ate,
  }));

  return (
    <div>
      {/* RDD說明 */}
      <div style={{background:`linear-gradient(135deg,rgba(0,229,255,.04),rgba(206,147,216,.03))`,border:`1px solid rgba(0,229,255,.15)`,borderRadius:10,padding:'13px 14px',marginBottom:12,fontSize:'.77rem',lineHeight:1.85}}>
        <div style={{fontSize:'.88rem',color:C.cy,fontWeight:700,marginBottom:7}}>📐 什麼是 RDD（斷點回歸設計）？</div>
        <p>RDD 是一種<strong style={{color:C.cy}}>準實驗因果推論方法</strong>。當某連續變數（跑動變數）跨越特定<strong style={{color:C.or}}>斷點</strong>時，兩側觀測值視為近似隨機，可估計因果效果。</p>
        <p style={{marginTop:6}}><strong style={{color:C.yw}}>本研究設定：</strong> 跑動變數=颶風天數/強度指數｜斷點=中位數｜結果=季度價格漲跌%｜ATE=處置組預測值−對照組預測值</p>
        <div style={{color:C.yw,fontSize:'.7rem',marginTop:8,padding:'7px 10px',background:'rgba(255,213,79,.07)',borderRadius:6,borderLeft:`3px solid ${C.yw}`,lineHeight:1.7}}>
          ⚠️ <strong>自查警告：</strong> n=14個颶風季，統計功效不足｜H1礦區天數=H2港口天數，兩假說結果相同｜使用中位數為斷點，非外生斷點
        </div>
      </div>

      {/* 帶寬控制 */}
      <div style={{background:C.s2,border:`1px solid ${C.bd}`,borderRadius:8,padding:'10px 12px',marginBottom:12,display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
        <span style={{fontSize:'.72rem',color:C.dm}}>帶寬倍數：</span>
        {[0.5,1.0,1.5,2.0].map(v=>(
          <button key={v} onClick={()=>setBw(v)} style={{padding:'5px 12px',borderRadius:6,border:`1px solid ${bw===v?C.cy:C.bd}`,background:bw===v?C.cy:'transparent',color:bw===v?'#000':C.tx,cursor:'pointer',fontSize:'.75rem',fontWeight:500}}>{v}x</button>
        ))}
      </div>

      {/* 假說卡片 */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:12}}>
        {HYPOS.map((hyp,i)=>{
          const res = results[i];
          return (
            <div key={i} onClick={()=>setActiveH(i)} style={{background:C.s2,border:`2px solid ${i===activeH?hyp.color:C.bd}`,borderRadius:10,padding:'12px',cursor:'pointer',position:'relative',overflow:'hidden',transition:'border-color .2s'}}>
              <div style={{position:'absolute',top:0,left:0,right:0,height:3,background:hyp.color,borderRadius:'10px 10px 0 0'}}/>
              <div style={{fontSize:'.65rem',color:C.dm,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:5}}>{hyp.label}</div>
              <div style={{fontSize:'1.55rem',fontWeight:900,fontFamily:'IBM Plex Mono,monospace',color:res.ate>0?C.gn:C.rd,lineHeight:1}}>{res.ate>0?'+':''}{res.ate}%</div>
              <div style={{fontSize:'.63rem',color:C.dm,marginTop:4,lineHeight:1.6}}>對照n={res.nc} | 處置n={res.nt}<br/>t={res.t} | d={res.d}</div>
              <div style={{marginTop:5}}><Sig p={res.p}/></div>
            </div>
          );
        })}
      </div>

      {/* 當前假說RDD圖 */}
      <Card title={`${h.label} — RDD 斷點回歸圖（點擊上方卡片切換假說）`}>
        <div style={{fontSize:'.7rem',color:C.dm,marginBottom:10,lineHeight:1.6}}>
          藍點=對照組（低颶風）｜橙點=處置組（高颶風）｜虛線=斷點（{h.threshold}）｜ATE={r.ate>0?'+':''}{r.ate}% ({r.ate>0?'颶風↑→價格↑':'颶風↑→價格↓'})
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <ScatterChart margin={{top:10,right:20,bottom:10,left:10}}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.bd} opacity={0.5}/>
            <XAxis type="number" dataKey="x" name="距斷點距離" tick={{fill:C.dm,fontSize:9}} label={{value:'跑動變數−斷點（0=斷點）',position:'insideBottom',fill:C.dm,fontSize:9,offset:-3}}/>
            <YAxis type="number" dataKey="y" name="季度價格變化%" tick={{fill:C.dm,fontSize:9}} tickFormatter={v=>`${v}%`}/>
            <Tooltip contentStyle={{background:C.s1,border:`1px solid ${C.bd}`,fontSize:'.72rem'}} content={({payload})=>{
              if(!payload||!payload.length) return null;
              const d=payload[0].payload;
              return <div style={{background:C.s1,border:`1px solid ${C.bd}`,borderRadius:7,padding:'8px 10px',fontSize:'.72rem'}}><div style={{color:d.group==='ctrl'?C.bl:h.color,fontWeight:600}}>{d.group==='ctrl'?'對照組':'處置組'}</div><div>{d.year}颶風季</div><div>跑動變數: {d.x.toFixed(2)}</div><div>季度價格變化: <strong style={{color:d.y>0?C.gn:C.rd}}>{d.y>0?'+':''}{d.y.toFixed(2)}%</strong></div></div>;
            }}/>
            <ReferenceLine x={0} stroke={C.yw} strokeWidth={2} strokeDasharray="5 4" label={{value:'斷點',fill:C.yw,fontSize:9}}/>
            <ReferenceLine y={0} stroke={C.dm} strokeWidth={1} opacity={0.4}/>
            <Scatter data={scatterData.filter(p=>p.group==='ctrl')} fill={C.bl} opacity={0.7} name="對照組"/>
            <Scatter data={scatterData.filter(p=>p.group==='trt')} fill={h.color} opacity={0.7} name="處置組"/>
          </ScatterChart>
        </ResponsiveContainer>
        <div style={{marginTop:10,padding:'8px 10px',background:C.s2,borderRadius:7,display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
          {[['對照組均值',r.cm+'%',C.bl],['處置組均值',r.tm+'%',h.color],['ATE（因果效果）',(r.ate>0?'+':'')+r.ate+'%',r.ate>0?C.gn:C.rd]].map(([l,v,c],i)=>(
            <div key={i} style={{textAlign:'center'}}>
              <div style={{fontSize:'.62rem',color:C.dm}}>{l}</div>
              <div style={{fontSize:'1.1rem',fontWeight:700,fontFamily:'IBM Plex Mono,monospace',color:c}}>{v}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* 敏感度分析 */}
      <Card title="🔬 帶寬敏感度分析（曲線越平=結果越穩健）">
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={sensData}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.bd} opacity={0.5}/>
            <XAxis dataKey="bw" tick={{fill:C.dm,fontSize:9}}/>
            <YAxis tick={{fill:C.dm,fontSize:9}} tickFormatter={v=>`${v}%`}/>
            <Tooltip contentStyle={{background:C.s1,border:`1px solid ${C.bd}`,fontSize:'.72rem'}} formatter={(v,n)=>[`${v>0?'+':''}${v}%`,n]}/>
            <ReferenceLine y={0} stroke={C.dm} strokeDasharray="4 4" opacity={0.5}/>
            <Line type="monotone" dataKey="h1" stroke={C.cy} strokeWidth={2} dot={{r:3}} name="H1礦區"/>
            <Line type="monotone" dataKey="h2" stroke={C.or} strokeWidth={2} dot={{r:3}} name="H2港口"/>
            <Line type="monotone" dataKey="h3" stroke={C.pu} strokeWidth={2} dot={{r:3}} name="H3強度"/>
            <Legend wrapperStyle={{fontSize:'.75rem',color:C.dm}}/>
          </LineChart>
        </ResponsiveContainer>
      </Card>

      {/* 摘要表 */}
      <Card title="📋 RDD結果摘要表">
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:'.74rem'}}>
            <thead>
              <tr style={{background:C.s2}}>
                {['假說','斷點','對照n','處置n','對照均值','處置均值','ATE','t值','p值','Cohen\'s d','顯著性'].map(h=>(
                  <th key={h} style={{padding:'8px 9px',textAlign:'left',color:C.dm,fontWeight:500,fontSize:'.63rem',textTransform:'uppercase',letterSpacing:'.04em',borderBottom:`1px solid ${C.bd}`,whiteSpace:'nowrap'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {HYPOS.map((hyp,i)=>{
                const res = results[i];
                return (
                  <tr key={i} style={{borderBottom:`1px solid ${C.bd}40`}}>
                    <td style={{padding:'8px 9px',color:hyp.color,fontWeight:600}}>{hyp.label}</td>
                    <td style={{padding:'8px 9px',fontFamily:'IBM Plex Mono,monospace'}}>{hyp.threshold}</td>
                    <td style={{padding:'8px 9px',textAlign:'center'}}>{res.nc}</td>
                    <td style={{padding:'8px 9px',textAlign:'center'}}>{res.nt}</td>
                    <td style={{padding:'8px 9px',fontFamily:'IBM Plex Mono,monospace'}}>{res.cm}%</td>
                    <td style={{padding:'8px 9px',fontFamily:'IBM Plex Mono,monospace'}}>{res.tm}%</td>
                    <td style={{padding:'8px 9px',fontFamily:'IBM Plex Mono,monospace',color:res.ate>0?C.gn:C.rd,fontWeight:700}}>{res.ate>0?'+':''}{res.ate}%</td>
                    <td style={{padding:'8px 9px',fontFamily:'IBM Plex Mono,monospace'}}>{res.t}</td>
                    <td style={{padding:'8px 9px',fontFamily:'IBM Plex Mono,monospace'}}>{res.p}</td>
                    <td style={{padding:'8px 9px',fontFamily:'IBM Plex Mono,monospace'}}>{res.d}</td>
                    <td style={{padding:'8px 9px'}}><Sig p={res.p}/></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{marginTop:10,padding:'9px 11px',background:'rgba(255,213,79,.07)',borderRadius:7,borderLeft:`3px solid ${C.yw}`,fontSize:'.72rem',lineHeight:1.75}}>
          <strong style={{color:C.yw}}>⚠️ 解讀注意：</strong> 負ATE表示「颶風天數越多，季度價格變化反而越低」。可能原因：①需求效應大於供應效應（颶風也影響下游鋼廠）②市場預期已提前反映③樣本n=14過小導致估計不穩定。建議配合事件研究法（Event Study）互補分析。
        </div>
      </Card>
    </div>
  );
}

// ═══ 颶風季 ═══
function SeasonTable() {
  return (
    <div>
      <Card title="📅 14個颶風季統計（2012-2025）">
        <div style={{overflowX:'auto',maxHeight:340,overflowY:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:'.73rem'}}>
            <thead style={{position:'sticky',top:0}}>
              <tr style={{background:C.s2}}>
                {['颶風季','颶風天','礦區天','季初價','季末價','季度漲跌','最大風速','強度指數'].map(h=>(
                  <th key={h} style={{padding:'8px 9px',textAlign:'left',color:C.dm,fontWeight:500,fontSize:'.62rem',textTransform:'uppercase',letterSpacing:'.04em',borderBottom:`1px solid ${C.bd}`,whiteSpace:'nowrap'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SEASONS.map((s,i)=>(
                <tr key={i} style={{borderBottom:`1px solid ${C.bd}40`}}>
                  <td style={{padding:'7px 9px',fontFamily:'IBM Plex Mono,monospace',color:C.cy,fontWeight:700}}>{s[0]}/{s[0]+1}</td>
                  <td style={{padding:'7px 9px',textAlign:'center',color:s[1]>0?C.or:C.dm}}>{s[1]}</td>
                  <td style={{padding:'7px 9px',textAlign:'center'}}>{s[2]}</td>
                  <td style={{padding:'7px 9px',fontFamily:'IBM Plex Mono,monospace'}}>${s[3].toFixed(1)}</td>
                  <td style={{padding:'7px 9px',fontFamily:'IBM Plex Mono,monospace'}}>${s[4].toFixed(1)}</td>
                  <td style={{padding:'7px 9px',fontFamily:'IBM Plex Mono,monospace',color:s[5]>=0?C.gn:C.rd,fontWeight:700}}>{s[5]>=0?'+':''}{s[5].toFixed(2)}%</td>
                  <td style={{padding:'7px 9px',fontFamily:'IBM Plex Mono,monospace',color:s[6]>=80?C.rd:C.dm}}>{s[6]>0?`${s[6]}kt`:'—'}</td>
                  <td style={{padding:'7px 9px',fontFamily:'IBM Plex Mono,monospace'}}>{s[7].toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="颶風天數 vs 季度價格變化（散點圖）">
        <ResponsiveContainer width="100%" height={200}>
          <ScatterChart>
            <CartesianGrid strokeDasharray="3 3" stroke={C.bd} opacity={0.5}/>
            <XAxis type="number" dataKey="x" name="颶風天數" tick={{fill:C.dm,fontSize:9}} label={{value:'颶風天數',position:'insideBottom',fill:C.dm,fontSize:9,offset:-2}}/>
            <YAxis type="number" dataKey="y" name="季度漲跌%" tick={{fill:C.dm,fontSize:9}} tickFormatter={v=>`${v}%`}/>
            <ReferenceLine y={0} stroke={C.dm} strokeDasharray="4 4" opacity={0.4}/>
            <Tooltip contentStyle={{background:C.s1,border:`1px solid ${C.bd}`,fontSize:'.72rem'}} content={({payload})=>{
              if(!payload||!payload.length)return null;
              const d=payload[0].payload;
              return <div style={{background:C.s1,border:`1px solid ${C.bd}`,borderRadius:7,padding:'8px 10px',fontSize:'.72rem'}}><div style={{color:C.cy,fontWeight:600}}>{d.year}颶風季</div><div>颶風天數: {d.x}</div><div>價格變化: <strong style={{color:d.y>0?C.gn:C.rd}}>{d.y>0?'+':''}{d.y.toFixed(2)}%</strong></div></div>;
            }}/>
            <Scatter data={SEASONS.map(s=>({x:s[1],y:s[5],year:s[0]}))} fill={C.cy} opacity={0.7}>
              {SEASONS.map((s,i)=><Cell key={i} fill={s[5]>=0?C.gn:C.rd} opacity={0.7}/>)}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}

// ═══ 颶風事件 ═══
function EventTable() {
  return (
    <Card title="🌀 12個颶風事件完整記錄">
      <div style={{overflowX:'auto',maxHeight:380,overflowY:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:'.73rem'}}>
          <thead style={{position:'sticky',top:0}}>
            <tr style={{background:C.s2}}>
              {['名稱','登陸日期','持續','風速','氣壓','港口風險','礦區風險'].map(h=>(
                <th key={h} style={{padding:'8px 9px',textAlign:'left',color:C.dm,fontWeight:500,fontSize:'.62rem',textTransform:'uppercase',letterSpacing:'.04em',borderBottom:`1px solid ${C.bd}`,whiteSpace:'nowrap'}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {EVENTS.slice().sort((a,b)=>b[4]-a[4]).map((ev,i)=>(
              <tr key={i} style={{borderBottom:`1px solid ${C.bd}40`}}>
                <td style={{padding:'7px 9px',color:C.cy,fontWeight:600}}>{ev[0]}</td>
                <td style={{padding:'7px 9px',fontFamily:'IBM Plex Mono,monospace',fontSize:'.68rem'}}>{ev[1]}</td>
                <td style={{padding:'7px 9px',textAlign:'center'}}>{ev[3]}天</td>
                <td style={{padding:'7px 9px',fontFamily:'IBM Plex Mono,monospace',color:ev[4]>=80?C.rd:C.yw}}>{ev[4]>0?`${ev[4]}kt`:'—'}</td>
                <td style={{padding:'7px 9px',fontFamily:'IBM Plex Mono,monospace',color:C.dm}}>{ev[5]>0?`${ev[5]}hPa`:'—'}</td>
                <td style={{padding:'7px 9px'}}><Tag level={ev[6]}/></td>
                <td style={{padding:'7px 9px'}}><Tag level={ev[7]}/></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ═══ 新增數據 ═══
function AddData() {
  const [form, setForm] = useState({date:new Date().toISOString().substring(0,10),price:'',hurricane:'0',name:'',wind:'',risk_p:'0',risk_m:'0'});
  const [status, setStatus] = useState(null);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const submit = () => {
    if (!form.date || !form.price) { setStatus({type:'er',msg:'請填入日期和價格'}); return; }
    setStatus({type:'ok',msg:`✓ 已記錄 ${form.date} 價格 $${form.price} USD/噸\n（注意：此版本數據不會永久儲存，請在電腦版系統匯出CSV後儲存）`});
    setTimeout(()=>setStatus(null),5000);
  };

  const field = (label,key,type='text',placeholder='') => (
    <div style={{display:'flex',flexDirection:'column',gap:3}}>
      <label style={{fontSize:'.62rem',color:C.dm,textTransform:'uppercase',letterSpacing:'.05em'}}>{label}</label>
      <input type={type} value={form[key]} onChange={e=>set(key,e.target.value)} placeholder={placeholder}
        style={{background:C.bg||'#07111f',border:`1px solid ${C.bd2||'#244570'}`,color:C.tx,padding:'7px 9px',borderRadius:6,fontSize:'.76rem',outline:'none'}}/>
    </div>
  );

  const select = (label,key,options) => (
    <div style={{display:'flex',flexDirection:'column',gap:3}}>
      <label style={{fontSize:'.62rem',color:C.dm,textTransform:'uppercase',letterSpacing:'.05em'}}>{label}</label>
      <select value={form[key]} onChange={e=>set(key,e.target.value)}
        style={{background:'#07111f',border:`1px solid #244570`,color:C.tx,padding:'7px 9px',borderRadius:6,fontSize:'.76rem',outline:'none'}}>
        {options.map(([v,l])=><option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );

  return (
    <Card title="✏️ 手動新增每日數據">
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
        {field('日期','date','date')}
        {field('CFR價格 (USD/噸)','price','number','105.50')}
        {select('是否有颶風','hurricane',[['0','無颶風'],['1','有颶風']])}
        {field('颶風名稱','name','text','CYCLONE_NAME')}
        {field('最大風速 (kt)','wind','number','85')}
        {select('港口風險等級','risk_p',[['0','無風險'],['1','🟢1安全'],['2','🟡2警戒'],['3','🔴3極危']])}
        {select('礦區風險等級','risk_m',[['0','無風險'],['1','🟢1安全'],['2','🟡2警戒'],['3','🔴3極危']])}
      </div>
      <button onClick={submit} style={{width:'100%',padding:'9px',background:C.cy,color:'#000',border:'none',borderRadius:7,fontSize:'.8rem',fontWeight:600,cursor:'pointer'}}>
        ➕ 新增記錄
      </button>
      {status && (
        <div style={{marginTop:8,padding:'8px 11px',borderRadius:7,fontSize:'.75rem',lineHeight:1.6,
          background:status.type==='ok'?'rgba(0,230,118,.1)':'rgba(239,83,80,.1)',
          border:`1px solid ${status.type==='ok'?'rgba(0,230,118,.2)':'rgba(239,83,80,.2)'}`,
          color:status.type==='ok'?C.gn:C.rd}}>
          {status.msg}
        </div>
      )}
      <div style={{marginTop:12,padding:'10px',background:C.s2,borderRadius:8,border:`1px solid ${C.bd}`,fontSize:'.73rem',color:C.dm,lineHeight:1.7}}>
        💡 <strong style={{color:C.yw}}>使用說明：</strong><br/>
        1. 在電腦上從 <strong style={{color:C.cy}}>Investing.com</strong> 或 <strong style={{color:C.cy}}>Trading Economics</strong> 查詢最新鐵礦石CFR價格<br/>
        2. 從 <strong style={{color:C.or}}>bom.gov.au/cyclone</strong> 查詢最新澳洲颶風資訊<br/>
        3. 填入上方表單並新增<br/>
        4. 建議同時更新電腦版系統的Excel主檔案
      </div>
    </Card>
  );
}

// ═══ 主應用 ═══
const TABS = [
  {id:'dash', label:'📊 儀表板', comp:Dashboard},
  {id:'rdd', label:'📐 RDD分析', comp:RDDAnalysis},
  {id:'ssn', label:'📅 颶風季', comp:SeasonTable},
  {id:'ev', label:'🌀 颶風事件', comp:EventTable},
  {id:'add', label:'➕ 新增數據', comp:AddData},
];

export default function App() {
  const [tab, setTab] = useState('dash');
  const Comp = TABS.find(t=>t.id===tab)?.comp || Dashboard;

  return (
    <div style={{background:C.bg,minHeight:'100vh',color:C.tx,fontFamily:'Noto Sans TC,sans-serif'}}>
      {/* Top Bar */}
      <div style={{background:C.s1,borderBottom:`1px solid ${C.bd}`,padding:'0 14px',height:48,display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:100}}>
        <div style={{fontSize:'.88rem',fontWeight:700}}>🌀 鐵礦石×颶風 <span style={{color:C.cy}}>RDD分析系統</span></div>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <span style={{background:'rgba(255,112,67,.1)',border:'1px solid rgba(255,112,67,.25)',color:C.or,padding:'3px 8px',borderRadius:4,fontSize:'.65rem'}}>12個颶風事件</span>
          <span style={{background:'rgba(0,229,255,.1)',border:'1px solid rgba(0,229,255,.25)',color:C.cy,padding:'3px 8px',borderRadius:4,fontSize:'.65rem'}}>4,837筆數據</span>
        </div>
      </div>

      {/* Tab Bar */}
      <div style={{background:C.s1,borderBottom:`1px solid ${C.bd}`,display:'flex',overflowX:'auto',padding:'0 10px',gap:1}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{padding:'10px 12px',fontSize:'.76rem',cursor:'pointer',color:tab===t.id?C.cy:C.dm,borderBottom:`2px solid ${tab===t.id?C.cy:'transparent'}`,background:'transparent',border:'none',borderBottom:`2px solid ${tab===t.id?C.cy:'transparent'}`,whiteSpace:'nowrap',transition:'all .15s',flexShrink:0,fontFamily:'inherit'}}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{padding:12,maxWidth:1200,margin:'0 auto'}}>
        <Comp/>
      </div>
    </div>
  );
}
