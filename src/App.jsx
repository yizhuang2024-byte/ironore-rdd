import { useState, useMemo } from "react";
import { LineChart, Line, BarChart, Bar, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, ResponsiveContainer, Cell } from "recharts";
import {
  rdEstimate, rotBandwidth, cvBandwidth, bandwidthCurve, specificationGrid,
  donutScan, jackknife, randomizationTest, placeboCutoffs, densityCheck, KERNEL_LABELS,
} from "./rdd.js";

// ═══ 嵌入數據 ═══
const MONTHLY = [["2013-01",150.92,0],["2013-02",155.57,8],["2013-03",142.51,1],["2013-04",138.74,0],["2013-05",130.03,0],["2013-06",120.68,0],["2013-07",130.5,0],["2013-08",138.24,0],["2013-09",133.35,0],["2013-10",132.47,0],["2013-11",135.78,0],["2013-12",136.37,8],["2014-01",128.55,0],["2014-02",120.86,1],["2014-03",116.32,0],["2014-04",107.97,0],["2014-05",100.89,0],["2014-06",88.97,0],["2014-07",93.86,0],["2014-08",91.38,0],["2014-09",81.11,0],["2014-10",77.48,0],["2014-11",73.31,0],["2014-12",69.01,0],["2015-01",63.78,0],["2015-02",63.29,7],["2015-03",57.25,0],["2015-04",52.42,0],["2015-05",61.5,0],["2015-06",63.38,0],["2015-07",53.1,0],["2015-08",53.89,0],["2015-09",54.66,0],["2015-10",52.52,0],["2015-11",44.75,0],["2015-12",39.87,0],["2016-01",42.52,6],["2016-02",48.4,0],["2016-03",55.53,0],["2016-04",63.76,0],["2016-05",56.29,0],["2016-06",53.95,0],["2016-07",56.89,0],["2016-08",60.09,0],["2016-09",56.54,0],["2016-10",58.99,0],["2016-11",72.45,0],["2016-12",80.33,0],["2017-01",84.06,0],["2017-02",90.43,0],["2017-03",85.54,0],["2017-04",67.73,0],["2017-05",61.95,0],["2017-06",54.8,0],["2017-07",70.0,0],["2017-08",74.42,0],["2017-09",62.31,0],["2017-10",60.59,0],["2017-11",63.57,0],["2017-12",73.54,0],["2018-01",76.66,9],["2018-02",76.49,0],["2018-03",68.42,0],["2018-04",64.77,0],["2018-05",67.15,0],["2018-06",65.78,0],["2018-07",65.39,0],["2018-08",68.28,0],["2018-09",67.76,0],["2018-10",73.96,0],["2018-11",65.77,0],["2018-12",70.96,0],["2019-01",75.18,0],["2019-02",87.79,0],["2019-03",86.55,9],["2019-04",93.32,0],["2019-05",98.43,0],["2019-06",107.8,0],["2019-07",119.17,0],["2019-08",91.99,0],["2019-09",91.38,0],["2019-10",91.7,0],["2019-11",87.06,0],["2019-12",93.54,0],["2020-01",95.05,0],["2020-02",90.36,7],["2020-03",87.54,0],["2020-04",84.42,0],["2020-05",94.02,0],["2020-06",101.27,0],["2020-07",106.77,0],["2020-08",124.54,0],["2020-09",116.4,0],["2020-10",119.97,0],["2020-11",128.07,0],["2020-12",155.61,0],["2021-01",161.37,11],["2021-02",167.59,0],["2021-03",167.45,0],["2021-04",181.5,0],["2021-05",208.28,0],["2021-06",212.97,0],["2021-07",200.47,0],["2021-08",164.4,0],["2021-09",116.47,0],["2021-10",119.67,0],["2021-11",97.38,0],["2021-12",118.58,0],["2022-01",137.99,0],["2022-02",141.56,0],["2022-03",156.26,0],["2022-04",146.3,0],["2022-05",131.52,0],["2022-06",126.15,0],["2022-07",103.01,0],["2022-08",99.22,0],["2022-09",97.07,0],["2022-10",92.14,0],["2022-11",93.09,0],["2022-12",112.45,0],["2023-01",123.13,0],["2023-02",126.37,0],["2023-03",124.44,11],["2023-04",106.96,0],["2023-05",104.97,0],["2023-06",113.05,0],["2023-07",109.88,0],["2023-08",109.32,0],["2023-09",117.14,0],["2023-10",120.32,0],["2023-11",128.87,0],["2023-12",139.31,0],["2024-01",134.02,0],["2024-02",120.39,0],["2024-03",110.01,0],["2024-04",107.0,0],["2024-05",116.36,0],["2024-06",105.96,0],["2024-07",103.9,0],["2024-08",96.78,0],["2024-09",91.79,0],["2024-10",99.93,0],["2024-11",103.16,0],["2024-12",103.79,0],["2025-01",101.26,7],["2025-02",107.37,14],["2025-03",103.13,0],["2025-04",98.67,0],["2025-05",100.44,0],["2025-06",101.52,0],["2025-07",99.23,0],["2025-08",97.44,0],["2025-09",98.11,0],["2025-10",102.3,0],["2025-11",105.2,0],["2025-12",106.8,0],["2026-01",107.5,0],["2026-02",106.9,0],["2026-03",106.1,12]];

const SEASONS = [[2012,9,9,146.74,139.87,-4.68,90.0,0.8571],[2013,8,8,127.43,111.83,-12.24,90.0,0.7587],[2014,7,7,68.92,39.58,-42.56,75.0,0.3544],[2015,6,6,39.58,79.75,101.49,48.0,0.163],[2016,0,0,79.75,71.28,-10.62,0,0],[2017,9,9,71.28,69.2,-2.92,45.0,0.2299],[2018,9,9,69.2,91.53,32.27,103.0,0.6213],[2019,7,7,91.53,155.84,70.26,80.0,0.4731],[2020,11,11,155.84,112.5,-27.81,58.0,0.3526],[2021,0,0,112.5,111.28,-1.09,0,0],[2022,11,11,111.28,136.37,22.55,95.0,0.6958],[2023,0,0,136.37,103.61,-24.03,0,0],[2024,14,14,103.61,107.37,3.63,105.0,0.9928],[2025,12,12,107.37,106.1,-1.18,0,0]];

const EVENTS = [["RUSTY","2013-02-21","2013-03-01",9,90,944,3,3],["CHRISTINE","2013-12-25","2014-01-01",8,90,948,3,2],["OLWYN","2015-03-08","2015-03-14",7,75,955,1,1],["STAN","2016-01-27","2016-02-01",6,48,984,3,2],["JOYCE","2018-01-07","2018-01-15",9,45,979,3,3],["VERONICA","2019-03-18","2019-03-26",9,103,941,3,2],["DAMIEN","2020-02-03","2020-02-09",7,80,958,2,3],["SEROJA","2021-04-02","2021-04-12",11,58,978,1,1],["ILSA","2023-04-05","2023-04-15",11,95,948,2,3],["SEAN","2025-01-17","2025-01-23",7,83,953,3,2],["ZELIA","2025-02-08","2025-02-14",7,105,928,3,3],["NARELLE","2026-03-17","2026-03-28",12,0,0,2,1]];

// ═══ 工具函數 ═══
// 統計核心（局部多項式估計、帶寬選擇、穩健性檢定）已抽到 src/rdd.js。
// 此處只保留資料塑形與畫面需要的薄包裝。

const OUTCOME = SEASONS.map((s) => s[5]); // 季度價格變化 %

const runningVar = (varIdx, threshold) => SEASONS.map((s) => s[varIdx] - threshold);

/** 沿用原介面的「帶寬倍數」語意：平均絕對距離 × 倍數 → 絕對帶寬 */
function bwFromMult(rv, mult) {
  const base = rv.reduce((s, v) => s + Math.abs(v), 0) / (rv.length || 1);
  return base * mult;
}

function calcRDD(varIdx, threshold, bwMult) {
  const rv = runningVar(varIdx, threshold);
  const bw = bwFromMult(rv, bwMult);
  // 均勻核 + 一階多項式 = 原本「帶寬內兩側各跑一條無加權迴歸」的設定，
  // 但改用 HC1 穩健變異數與真正的 t 分布 p 值。
  const r = rdEstimate({ rv, y: OUTCOME, h: bw, kernel: 'uniform', poly: 1 });
  return {
    ...r,
    bw: +bw.toFixed(2),
    threshold,
    scatterPts: SEASONS.map((s, i) => ({
      x: +rv[i].toFixed(2), y: OUTCOME[i], year: s[0],
      group: rv[i] < 0 ? 'ctrl' : 'trt',
      inBW: Math.abs(rv[i]) <= bw,
    })),
  };
}

// ═══ 顏色 ═══
const C = { bg:'#07111f', s1:'#0d1b2e', s2:'#112039', bd:'#1b3354', cy:'#00e5ff', or:'#ff7043', gn:'#00e676', pu:'#ce93d8', rd:'#ef5350', yw:'#ffd54f', bl:'#42a5f5', tx:'#dde8f5', dm:'#4a6580' };

// ═══ 假說設定（RDD 分析與穩健性檢定共用） ═══
const HYPOS = [
  { key: 'H1', label: 'H1 礦區颶風天數', short: 'H1 礦區', varIdx: 1, threshold: 7, color: C.cy, unit: '天' },
  { key: 'H2', label: 'H2 港口颶風天數', short: 'H2 港口', varIdx: 2, threshold: 7, color: C.or, unit: '天' },
  { key: 'H3', label: 'H3 颶風強度指數', short: 'H3 強度', varIdx: 7, threshold: 0.35, color: C.pu, unit: '' },
];

// H1 與 H2 目前取自同兩欄資料，逐列比對確認是否真的重複
const H1_EQ_H2 = SEASONS.every((s) => s[1] === s[2]);

/**
 * RDD 設計診斷：在跑任何估計之前，先確認這個設計到底識不識別得出來。
 * 跑動變數若高度離散、斷點附近沒有觀測，局部線性外推出來的 ATE 只是
 * 遠端質點的外插值，不是斷點處的因果效果。
 */
function designDiagnostics(varIdx, threshold, h) {
  const x = SEASONS.map((s) => s[varIdx]);
  const rv = x.map((v) => v - threshold);
  const distinct = [...new Set(x)].sort((a, b) => a - b);
  const left = rv.filter((v) => v < 0);
  const right = rv.filter((v) => v >= 0);
  const nearestL = left.length ? Math.max(...left) : null;
  const nearestR = right.length ? Math.min(...right) : null;
  const inL = [...new Set(rv.filter((v) => v < 0 && Math.abs(v) <= h))];
  const inR = [...new Set(rv.filter((v) => v >= 0 && Math.abs(v) <= h))];
  const dens = densityCheck(rv, h);
  const span = Math.max(...rv.map((v) => Math.abs(v)));
  const issues = [];
  if (h >= span) {
    issues.push(`帶寬 ${h.toFixed(2)} 已涵蓋全部樣本（最遠觀測距斷點 ${span.toFixed(2)}），這已是全樣本迴歸而非斷點附近的局部比較`);
  }
  if (nearestL !== null && Math.abs(nearestL) > h) issues.push(`帶寬 ${h.toFixed(2)} 內左側沒有任何觀測（最近的對照組距斷點 ${Math.abs(nearestL).toFixed(2)}）`);
  else if (inL.length < 2) issues.push(`帶寬內左側只有 ${inL.length} 個相異跑動變數值，對照組斜率無法識別`);
  if (inR.length < 2) issues.push(`帶寬內右側只有 ${inR.length} 個相異跑動變數值，處置組斜率無法識別`);
  if (distinct.length <= 8) issues.push(`跑動變數只有 ${distinct.length} 個相異值（${distinct.join('、')}），屬高度離散，非標準連續型 RDD`);
  if (nearestL !== null && nearestR !== null && nearestR - nearestL > 1) {
    issues.push(`斷點兩側最近觀測相距 ${(nearestR - nearestL).toFixed(2)}，斷點附近是資料空洞`);
  }
  if (dens.p < 0.1) issues.push(`帶寬內兩側觀測數失衡（${dens.nL} vs ${dens.nR}，二項檢定 p=${dens.p}）`);
  return { x, rv, distinct, nearestL, nearestR, inL, inR, dens, issues };
}

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
            <Tooltip contentStyle={{background:C.s1,border:`1px solid ${C.bd}`,borderRadius:8,fontSize:'.75rem'}} formatter={(v)=>[`$${v} USD/噸`,'CFR價格']}/>
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

  const results = HYPOS.map(h => calcRDD(h.varIdx, h.threshold, bw));
  const r = results[activeH];
  const h = HYPOS[activeH];

  // RDD散點圖數據
  const scatterData = r.scatterPts.filter(p=>p.inBW).map(p=>({
    x: p.x, y: p.y, year: p.year, group: p.group
  }));

  // 敏感度分析
  const bwRange = [0.3,0.5,0.75,1.0,1.25,1.5,2.0];
  const sensData = bwRange.map(bwv=>{
    const pick = (vi,th)=>{ const res = calcRDD(vi,th,bwv); return res.valid ? res.ate : null; };
    return { bw:bwv+'x', h1: pick(1,7), h2: pick(2,7), h3: pick(7,0.35) };
  });

  return (
    <div>
      {/* RDD說明 */}
      <div style={{background:`linear-gradient(135deg,rgba(0,229,255,.04),rgba(206,147,216,.03))`,border:`1px solid rgba(0,229,255,.15)`,borderRadius:10,padding:'13px 14px',marginBottom:12,fontSize:'.77rem',lineHeight:1.85}}>
        <div style={{fontSize:'.88rem',color:C.cy,fontWeight:700,marginBottom:7}}>📐 什麼是 RDD（斷點回歸設計）？</div>
        <p>RDD 是一種<strong style={{color:C.cy}}>準實驗因果推論方法</strong>。當某連續變數（跑動變數）跨越特定<strong style={{color:C.or}}>斷點</strong>時，兩側觀測值視為近似隨機，可估計因果效果。</p>
        <p style={{marginTop:6}}><strong style={{color:C.yw}}>本研究設定：</strong> 跑動變數=颶風天數/強度指數｜斷點=中位數｜結果=季度價格漲跌%｜ATE=處置組預測值−對照組預測值</p>
        <div style={{color:C.rd,fontSize:'.7rem',marginTop:8,padding:'7px 10px',background:'rgba(239,83,80,.08)',borderRadius:6,borderLeft:`3px solid ${C.rd}`,lineHeight:1.7}}>
          ⚠️ <strong>自查警告：</strong> n=14個颶風季，統計功效不足｜{H1_EQ_H2 ? 'H1礦區天數與H2港口天數為完全相同的數列，兩假說並非獨立檢定' : 'H1與H2資料來源不同'}｜使用中位數為斷點，非外生斷點｜
          跑動變數高度離散、斷點附近無觀測，多數帶寬下 <strong>對照組不足以識別斜率</strong>。本頁數字請務必搭配
          <strong style={{color:C.yw}}>「🧪 穩健性 RBA」</strong>分頁的診斷一起看。
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
              {res.valid ? (
                <>
                  <div style={{fontSize:'1.55rem',fontWeight:900,fontFamily:'IBM Plex Mono,monospace',color:res.ate>0?C.gn:C.rd,lineHeight:1}}>{res.ate>0?'+':''}{res.ate}%</div>
                  <div style={{fontSize:'.63rem',color:C.dm,marginTop:4,lineHeight:1.6}}>對照n={res.nc} | 處置n={res.nt}<br/>t={res.t} | se={res.se}</div>
                  <div style={{marginTop:5}}><Sig p={res.p}/></div>
                </>
              ) : (
                <>
                  <div style={{fontSize:'1.05rem',fontWeight:800,color:C.rd,lineHeight:1.3}}>不可識別</div>
                  <div style={{fontSize:'.63rem',color:C.dm,marginTop:4,lineHeight:1.6}}>對照n={res.nc} | 處置n={res.nt}<br/>此帶寬內樣本不足以配適兩側迴歸</div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* 當前假說RDD圖 */}
      <Card title={`${h.label} — RDD 斷點回歸圖（點擊上方卡片切換假說）`}>
        <div style={{fontSize:'.7rem',color:C.dm,marginBottom:10,lineHeight:1.6}}>
          藍點=對照組（低颶風）｜橙點=處置組（高颶風）｜虛線=斷點（{h.threshold}）｜
          {r.valid
            ? <>ATE={r.ate>0?'+':''}{r.ate}%（95% CI {r.ci[0]}% ~ {r.ci[1]}%）{r.ate>0?'颶風↑→價格↑':'颶風↑→價格↓'}</>
            : <span style={{color:C.rd}}>此帶寬下無法估計 ATE（兩側有效觀測不足）</span>}
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
          {[['對照組均值',r.cm+'%',C.bl],['處置組均值',r.tm+'%',h.color],['ATE（因果效果）',r.valid?(r.ate>0?'+':'')+r.ate+'%':'不可識別',r.valid?(r.ate>0?C.gn:C.rd):C.rd]].map(([l,v,c],i)=>(
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
                    <td style={{padding:'8px 9px',fontFamily:'IBM Plex Mono,monospace',color:res.valid?(res.ate>0?C.gn:C.rd):C.dm,fontWeight:700}}>{res.valid?`${res.ate>0?'+':''}${res.ate}%`:'—'}</td>
                    <td style={{padding:'8px 9px',fontFamily:'IBM Plex Mono,monospace'}}>{res.valid?res.t:'—'}</td>
                    <td style={{padding:'8px 9px',fontFamily:'IBM Plex Mono,monospace'}}>{res.valid?res.p:'—'}</td>
                    <td style={{padding:'8px 9px',fontFamily:'IBM Plex Mono,monospace'}}>{res.valid?res.d:'—'}</td>
                    <td style={{padding:'8px 9px'}}>{res.valid ? <Sig p={res.p}/> : <span style={{color:C.rd,fontSize:'.62rem'}}>不可識別</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{marginTop:10,padding:'9px 11px',background:'rgba(255,213,79,.07)',borderRadius:7,borderLeft:`3px solid ${C.yw}`,fontSize:'.72rem',lineHeight:1.75}}>
          <strong style={{color:C.yw}}>⚠️ 解讀注意：</strong> 負ATE表示「颶風天數越多，季度價格變化反而越低」。可能原因：①需求效應大於供應效應（颶風也影響下游鋼廠）②市場預期已提前反映③樣本n=14過小導致估計不穩定。
          p 值已改用 Student-t 分布計算、標準誤採 HC1 異質變異數穩健三明治估計；但在 n=14 下漸近推論仍不可靠，
          請以「🧪 穩健性 RBA」分頁的<strong style={{color:C.cy}}>隨機化推論</strong>與<strong style={{color:C.cy}}>安慰劑斷點</strong>為準。建議配合事件研究法（Event Study）互補分析。
        </div>
      </Card>
    </div>
  );
}

// ═══ 穩健性檢定 RBA（Robustness & Bandwidth Analysis） ═══
const VERDICT = {
  pass: { c: C.gn, t: '通過' },
  warn: { c: C.yw, t: '存疑' },
  fail: { c: C.rd, t: '未通過' },
  na: { c: C.dm, t: '無法判定' },
};

const Badge = ({ status, label }) => {
  const v = VERDICT[status] || VERDICT.na;
  return (
    <span style={{background:v.c+'1e',color:v.c,border:`1px solid ${v.c}55`,padding:'2px 8px',borderRadius:4,fontSize:'.62rem',fontWeight:700,whiteSpace:'nowrap'}}>
      {label || v.t}
    </span>
  );
};

const Stat = ({ label, value, color = C.tx, sub }) => (
  <div style={{textAlign:'center',padding:'6px 4px'}}>
    <div style={{fontSize:'.6rem',color:C.dm,marginBottom:3}}>{label}</div>
    <div style={{fontSize:'1.05rem',fontWeight:700,fontFamily:'IBM Plex Mono,monospace',color,lineHeight:1.2}}>{value}</div>
    {sub && <div style={{fontSize:'.58rem',color:C.dm,marginTop:2}}>{sub}</div>}
  </div>
);

function RobustnessAnalysis() {
  const [hIdx, setHIdx] = useState(0);
  const [hMode, setHMode] = useState('rot');
  const [manualStep, setManualStep] = useState(null);

  const hyp = HYPOS[hIdx];

  const core = useMemo(() => {
    const rv = runningVar(hyp.varIdx, hyp.threshold);
    const x = SEASONS.map((s) => s[hyp.varIdx]);
    const span = Math.max(...rv.map((v) => Math.abs(v)));
    // 網格上限取 1.5×span：若只掃到 span，識別性差的假說整條曲線都會是空的，
    // 看不出「帶寬要放到多寬才勉強估得出來、代價是什麼」。
    const grid = Array.from({ length: 24 }, (_, i) => +((span * 1.5 * (i + 1)) / 24).toFixed(4));
    const rot = rotBandwidth(rv);
    const cv = cvBandwidth(rv, OUTCOME, grid);
    return { rv, x, span, grid, rot, cv };
  }, [hyp]);

  const { rv, x, span, grid, rot, cv } = core;
  const h = hMode === 'cv' && cv ? cv.h
    : hMode === 'manual' && manualStep !== null ? grid[manualStep]
    : rot;

  const rba = useMemo(() => {
    const diag = designDiagnostics(hyp.varIdx, hyp.threshold, h);
    const main = rdEstimate({ rv, y: OUTCOME, h, kernel: 'triangular', poly: 1 });
    const curve = bandwidthCurve(rv, OUTCOME, grid, { kernel: 'triangular', poly: 1 });
    const specs = specificationGrid(rv, OUTCOME, h);
    const donut = donutScan(rv, OUTCOME, h, [0, span * 0.1, span * 0.2, span * 0.3].map((d) => +d.toFixed(2)));
    const jack = jackknife(rv, OUTCOME, h);
    const ri = randomizationTest(rv, OUTCOME, h, {}, 2000);
    const placebo = placeboCutoffs(x, OUTCOME, hyp.threshold, h);
    return { diag, main, curve, specs, donut, jack, ri, placebo };
  }, [hyp, rv, x, h, grid, span]);

  const { diag, main, curve, specs, donut, jack, ri, placebo } = rba;

  // ── 逐項判定 ──────────────────────────────────────────────
  const validCurve = curve.filter((c) => c.valid && c.ate !== null);
  const curveSigns = new Set(validCurve.map((c) => Math.sign(c.ate)));
  const validSpecs = specs.filter((s) => s.valid && s.ate !== null);
  const specSigns = new Set(validSpecs.map((s) => Math.sign(s.ate)));
  const donutValid = donut.filter((d) => d.valid);
  const jackSpread = jack.full !== null && jack.reps.some((r) => r.valid)
    ? Math.max(...jack.reps.filter((r) => r.valid).map((r) => Math.abs(r.ate - jack.full)))
    : null;

  const checks = [
    {
      id: 'RBA-0', name: '設計識別性',
      status: diag.issues.length === 0 ? 'pass' : diag.issues.length <= 1 ? 'warn' : 'fail',
      note: diag.issues.length === 0 ? '斷點附近有足夠且平衡的觀測' : `${diag.issues.length} 項結構問題（見下方診斷）`,
    },
    {
      id: 'RBA-1', name: '帶寬穩健性',
      status: validCurve.length < 3 ? 'na' : curveSigns.size === 1 ? 'pass' : 'fail',
      note: validCurve.length < 3
        ? `20 個帶寬中僅 ${validCurve.length} 個可估計`
        : curveSigns.size === 1 ? '所有可估計帶寬下 ATE 同號' : 'ATE 隨帶寬變號，方向不穩定',
    },
    {
      id: 'RBA-2', name: '設定穩健性',
      status: validSpecs.length < 3 ? 'na' : specSigns.size === 1 ? 'pass' : 'fail',
      note: `${validSpecs.length}/${specs.length} 個「多項式階數 × 核函數」組合可估計` + (validSpecs.length >= 3 ? (specSigns.size === 1 ? '，方向一致' : '，方向不一致') : ''),
    },
    {
      id: 'RBA-3', name: '安慰劑斷點',
      status: placebo.p === null ? 'na' : placebo.p <= 0.1 ? 'pass' : placebo.p <= 0.25 ? 'warn' : 'fail',
      note: placebo.p === null ? '真斷點無法估計，無從比較'
        : `${placebo.extreme}/${placebo.nFar} 個假斷點的效果不小於真斷點（p=${placebo.p}）`,
    },
    {
      id: 'RBA-4', name: 'Donut-hole',
      status: donutValid.length < 2 ? 'na'
        : new Set(donutValid.map((d) => Math.sign(d.ate))).size === 1 ? 'pass' : 'fail',
      note: `剔除斷點附近觀測後，${donutValid.length}/${donut.length} 種設定仍可估計`,
    },
    {
      id: 'RBA-5', name: '單點影響力',
      status: jackSpread === null || jack.full === null ? 'na'
        : Math.abs(jackSpread) <= Math.abs(jack.full) * 0.3 ? 'pass'
        : Math.abs(jackSpread) <= Math.abs(jack.full) * 0.6 ? 'warn' : 'fail',
      note: jackSpread === null ? '刀切法無有效重複樣本'
        : `任一季剔除後，ATE 最多變動 ${jackSpread.toFixed(1)} 個百分點`,
    },
    {
      id: 'RBA-6', name: '隨機化推論',
      status: !ri.valid ? 'na' : ri.p <= 0.05 ? 'pass' : ri.p <= 0.1 ? 'warn' : 'fail',
      note: ri.valid ? `${ri.draws} 次殘差置換，p=${ri.p}（窗內 n=${ri.nWin}）` : '帶寬窗內樣本不足以做置換檢定',
    },
  ];

  const nFail = checks.filter((c) => c.status === 'fail').length;
  const nPass = checks.filter((c) => c.status === 'pass').length;
  // 設計識別性是前提：它沒過，後面幾項再漂亮也不能算通過。
  const overall = checks[0].status === 'fail' || nFail >= 3 ? 'fail'
    : nFail > 0 || checks[0].status !== 'pass' ? 'warn'
    : nPass >= 5 ? 'pass' : 'warn';

  // ── 圖表資料 ──────────────────────────────────────────────
  const jackData = jack.reps.map((r) => ({ year: SEASONS[r.i][0], ate: r.valid ? r.ate : null }));
  const riHist = useMemo(() => {
    if (!ri.valid || !ri.dist.length) return [];
    const lo = Math.min(...ri.dist, ri.obs), hi = Math.max(...ri.dist, ri.obs);
    const bins = 24, w = (hi - lo) / bins || 1;
    const counts = Array(bins).fill(0);
    ri.dist.forEach((v) => { counts[Math.min(bins - 1, Math.max(0, Math.floor((v - lo) / w)))] += 1; });
    return counts.map((n, i) => ({ mid: +(lo + w * (i + 0.5)).toFixed(1), n, extreme: Math.abs(lo + w * (i + 0.5)) >= Math.abs(ri.obs) }));
  }, [ri]);

  const fmt = (v, unit = '%') => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${v}${unit}`);
  // p 值四捨五入後可能剛好是 0，直接印「0」會誤導成「絕對確定」
  const fmtP = (v) => (v === null || v === undefined ? '—' : v === 0 ? '<0.0001' : v);

  return (
    <div>
      {/* 說明 */}
      <div style={{background:'linear-gradient(135deg,rgba(255,213,79,.05),rgba(206,147,216,.03))',border:'1px solid rgba(255,213,79,.18)',borderRadius:10,padding:'13px 14px',marginBottom:12,fontSize:'.77rem',lineHeight:1.85}}>
        <div style={{fontSize:'.88rem',color:C.yw,fontWeight:700,marginBottom:7}}>🧪 RBA — 穩健性與帶寬分析</div>
        <p>單一個 ATE 數字說明不了任何事。RBA 把同一個斷點在<strong style={{color:C.cy}}>不同帶寬、不同多項式階數、不同核函數、不同斷點位置</strong>下重跑一遍，看結論會不會垮掉。</p>
        <p style={{marginTop:6}}>推論以<strong style={{color:C.yw}}>隨機化推論</strong>（Freedman–Lane 殘差置換）為主：n=14 時 t 檢定的漸近性質不成立，置換檢定不依賴常態假設。標準誤採 HC1 異質變異數穩健三明治估計。</p>
      </div>

      {/* 控制列 */}
      <div style={{background:C.s2,border:`1px solid ${C.bd}`,borderRadius:8,padding:'10px 12px',marginBottom:12,display:'flex',flexDirection:'column',gap:9}}>
        <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
          <span style={{fontSize:'.72rem',color:C.dm,minWidth:52}}>假說：</span>
          {HYPOS.map((hy, i) => (
            <button key={hy.key} onClick={() => setHIdx(i)}
              style={{padding:'5px 11px',borderRadius:6,border:`1px solid ${i===hIdx?hy.color:C.bd}`,background:i===hIdx?hy.color:'transparent',color:i===hIdx?'#000':C.tx,cursor:'pointer',fontSize:'.73rem',fontWeight:500}}>
              {hy.short}
            </button>
          ))}
          {H1_EQ_H2 && hIdx <= 1 && (
            <span style={{fontSize:'.65rem',color:C.rd}}>⚠ H1 與 H2 的資料完全相同，結果必然一致</span>
          )}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
          <span style={{fontSize:'.72rem',color:C.dm,minWidth:52}}>帶寬：</span>
          {[['rot', `經驗法則 ${rot}`], ['cv', cv ? `交叉驗證 ${cv.h}` : '交叉驗證 —'], ['manual', '手動']].map(([m, label]) => (
            <button key={m} onClick={() => { setHMode(m); if (m === 'manual' && manualStep === null) setManualStep(Math.floor(grid.length / 2)); }}
              disabled={m === 'cv' && !cv}
              style={{padding:'5px 11px',borderRadius:6,border:`1px solid ${hMode===m?C.cy:C.bd}`,background:hMode===m?C.cy:'transparent',color:hMode===m?'#000':(m==='cv'&&!cv?C.dm:C.tx),cursor:m==='cv'&&!cv?'not-allowed':'pointer',fontSize:'.73rem'}}>
              {label}
            </button>
          ))}
          {hMode === 'manual' && (
            <input type="range" min={0} max={grid.length - 1} value={manualStep ?? 0}
              onChange={(e) => setManualStep(+e.target.value)} style={{flex:1,minWidth:120,accentColor:C.cy}}/>
          )}
          <span style={{fontSize:'.74rem',color:C.cy,fontFamily:'IBM Plex Mono,monospace'}}>h = {h.toFixed(2)} {hyp.unit}</span>
        </div>
      </div>

      {/* 總判定 */}
      <div style={{background:C.s1,border:`2px solid ${VERDICT[overall].c}55`,borderRadius:10,padding:'13px 14px',marginBottom:12}}>
        <div style={{display:'flex',alignItems:'center',gap:9,marginBottom:9,flexWrap:'wrap'}}>
          <span style={{fontSize:'.85rem',fontWeight:700,color:VERDICT[overall].c}}>
            {overall === 'pass' ? '✅ 穩健性總判定：通過' : overall === 'warn' ? '⚠️ 穩健性總判定：存疑' : '❌ 穩健性總判定：未通過'}
          </span>
          <span style={{fontSize:'.7rem',color:C.dm}}>{hyp.label}｜斷點 {hyp.threshold}｜h={h.toFixed(2)}｜{nPass} 項通過 / {nFail} 項未通過</span>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(230px,1fr))',gap:7}}>
          {checks.map((c) => (
            <div key={c.id} style={{background:C.s2,border:`1px solid ${VERDICT[c.status].c}33`,borderRadius:7,padding:'8px 10px'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:6,marginBottom:3}}>
                <span style={{fontSize:'.72rem',fontWeight:600,color:C.tx}}><span style={{color:C.dm,fontFamily:'IBM Plex Mono,monospace',fontSize:'.66rem'}}>{c.id}</span> {c.name}</span>
                <Badge status={c.status}/>
              </div>
              <div style={{fontSize:'.66rem',color:C.dm,lineHeight:1.6}}>{c.note}</div>
            </div>
          ))}
        </div>
        {overall === 'warn' && checks[0].status !== 'pass' && (
          <div style={{marginTop:10,padding:'9px 11px',background:'rgba(255,213,79,.07)',borderLeft:`3px solid ${C.yw}`,borderRadius:6,fontSize:'.72rem',lineHeight:1.75,color:C.tx}}>
            <strong style={{color:C.yw}}>注意：</strong>多數穩健性檢定過關，但<strong>設計識別性本身有疑慮</strong>（見下方 RBA-0）。
            穩健性檢定只能證明「在這個設計下結果不易被設定牽動」，無法補救設計本身不成立的問題 —
            對一個不是局部比較的估計做敏感度分析，穩定只代表它穩定地不是因果效果。
          </div>
        )}
        {overall === 'fail' && (
          <div style={{marginTop:10,padding:'9px 11px',background:'rgba(239,83,80,.08)',borderLeft:`3px solid ${C.rd}`,borderRadius:6,fontSize:'.72rem',lineHeight:1.75,color:C.tx}}>
            <strong style={{color:C.rd}}>結論：</strong>此假說的 RDD 估計<strong>不應作為因果證據引用</strong>。在斷點附近沒有足夠觀測支撐的情況下，
            所謂 ATE 其實是把遠離斷點的資料點外插到斷點上的產物，換個帶寬或設定就會改變甚至變號。
            建議改用<strong style={{color:C.cy}}>事件研究法</strong>（以颶風登陸日為事件日，看前後累積異常報酬）或
            <strong style={{color:C.cy}}>合成控制法</strong>，並把颶風天數當連續處置強度處理，而不是硬切斷點。
          </div>
        )}
      </div>

      {/* RBA-0 設計診斷 */}
      <Card title="RBA-0 設計診斷：這個斷點識別得出來嗎？">
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(110px,1fr))',gap:6,background:C.s2,borderRadius:7,marginBottom:10}}>
          <Stat label="相異跑動變數值" value={diag.distinct.length} color={diag.distinct.length <= 8 ? C.rd : C.tx} sub={`共 ${SEASONS.length} 季`}/>
          <Stat label="左側最近觀測" value={diag.nearestL === null ? '無' : diag.nearestL.toFixed(2)} color={diag.nearestL !== null && Math.abs(diag.nearestL) > h ? C.rd : C.bl} sub="距斷點"/>
          <Stat label="右側最近觀測" value={diag.nearestR === null ? '無' : diag.nearestR.toFixed(2)} color={hyp.color} sub="距斷點"/>
          <Stat label="帶寬內相異值" value={`${diag.inL.length} / ${diag.inR.length}`} color={diag.inL.length < 2 || diag.inR.length < 2 ? C.rd : C.gn} sub="左 / 右"/>
          <Stat label="帶寬內觀測數" value={`${diag.dens.nL} / ${diag.dens.nR}`} color={diag.dens.p < 0.1 ? C.yw : C.gn} sub={`平衡檢定 p=${diag.dens.p}`}/>
        </div>
        {diag.issues.length > 0 ? (
          <ul style={{margin:0,paddingLeft:18,fontSize:'.72rem',lineHeight:1.9,color:C.tx}}>
            {diag.issues.map((iss, i) => <li key={i}><span style={{color:C.rd}}>✕</span> {iss}</li>)}
          </ul>
        ) : (
          <div style={{fontSize:'.73rem',color:C.gn}}>✓ 未發現結構性識別問題。</div>
        )}
        <div style={{marginTop:10,display:'flex',flexWrap:'wrap',gap:4}}>
          {SEASONS.map((s, i) => {
            const v = rv[i];
            const inBw = Math.abs(v) <= h;
            const col = !inBw ? C.dm : v >= 0 ? hyp.color : C.bl;
            return (
              <span key={s[0]} title={`${s[0]} 季：跑動變數 ${x[i]}，價格變化 ${OUTCOME[i]}%`}
                style={{fontSize:'.63rem',fontFamily:'IBM Plex Mono,monospace',color:col,border:`1px solid ${col}44`,background:inBw?col+'12':'transparent',borderRadius:4,padding:'2px 6px'}}>
                {s[0]} {v >= 0 ? '+' : ''}{v.toFixed(2)}
              </span>
            );
          })}
        </div>
        <div style={{fontSize:'.65rem',color:C.dm,marginTop:7}}>標籤為各季「跑動變數 − 斷點」；填色者落在目前帶寬內，藍=對照、彩=處置。</div>
      </Card>

      {/* 主估計 */}
      <Card title={` 目前設定下的點估計（三角核・局部線性・h=${h.toFixed(2)}）`}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(105px,1fr))',gap:6,background:C.s2,borderRadius:7}}>
          <Stat label="ATE" value={main.valid ? fmt(main.ate) : '不可識別'} color={main.valid ? (main.ate > 0 ? C.gn : C.rd) : C.rd}/>
          <Stat label="穩健標準誤" value={main.valid ? main.se : '—'} color={C.tx} sub="HC1"/>
          <Stat label="95% CI" value={main.valid ? `${main.ci[0]} ~ ${main.ci[1]}` : '—'} color={C.dm}/>
          <Stat label="t 檢定 p" value={main.valid ? fmtP(main.p) : '—'} color={main.valid && main.p <= 0.05 ? C.gn : C.dm} sub={main.valid ? `df=${main.df}` : ''}/>
          <Stat label="隨機化 p" value={ri.valid ? fmtP(ri.p) : '—'} color={ri.valid && ri.p <= 0.05 ? C.gn : C.yw} sub="置換檢定"/>
          <Stat label="有效樣本" value={`${main.nc} / ${main.nt}`} color={C.tx} sub="對照 / 處置"/>
        </div>
        {!main.valid && (
          <div style={{marginTop:9,fontSize:'.72rem',color:C.rd,lineHeight:1.7}}>
            此帶寬下至少有一側的有效觀測不足（需要每側至少 3 個點、2 個相異跑動變數值）才能配適局部線性。
            舊版程式在這種情況下會把空迴歸的截距當成 0，於是憑空產生一個看似顯著的 ATE — 現在改為明確標示不可識別。
          </div>
        )}
      </Card>

      {/* RBA-1 帶寬敏感度 */}
      <Card title="RBA-1 帶寬敏感度（含 95% 信賴帶；曲線越平＝越穩健）">
        <ResponsiveContainer width="100%" height={190}>
          <LineChart data={curve}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.bd} opacity={0.5}/>
            <XAxis dataKey="h" tick={{fill:C.dm,fontSize:9}} label={{value:'帶寬 h',position:'insideBottom',fill:C.dm,fontSize:9,offset:-3}}/>
            <YAxis tick={{fill:C.dm,fontSize:9}} tickFormatter={(v)=>`${v}%`}/>
            <Tooltip contentStyle={{background:C.s1,border:`1px solid ${C.bd}`,fontSize:'.72rem'}}
              formatter={(v, n) => [v === null ? '不可識別' : `${v}%`, n]}
              labelFormatter={(l) => `h = ${l}`}/>
            <ReferenceLine y={0} stroke={C.dm} strokeDasharray="4 4" opacity={0.6}/>
            <ReferenceLine x={rot} stroke={C.yw} strokeDasharray="5 4" label={{value:'ROT',fill:C.yw,fontSize:9,position:'top'}}/>
            {cv && <ReferenceLine x={cv.h} stroke={C.gn} strokeDasharray="5 4" label={{value:'CV',fill:C.gn,fontSize:9,position:'top'}}/>}
            <Line type="monotone" dataKey="lo" stroke={C.dm} strokeWidth={1} strokeDasharray="3 3" dot={false} name="CI 下界" connectNulls={false}/>
            <Line type="monotone" dataKey="hi" stroke={C.dm} strokeWidth={1} strokeDasharray="3 3" dot={false} name="CI 上界" connectNulls={false}/>
            <Line type="monotone" dataKey="ate" stroke={hyp.color} strokeWidth={2.2} dot={{r:3}} name="ATE" connectNulls={false}/>
            <Legend wrapperStyle={{fontSize:'.7rem'}}/>
          </LineChart>
        </ResponsiveContainer>
        <div style={{fontSize:'.68rem',color:C.dm,marginTop:6,lineHeight:1.7}}>
          曲線斷掉的區段代表該帶寬下兩側樣本不足、估計不存在。
          ROT＝經驗法則帶寬 1.84·SD·n^(−1/5)；CV＝留一交叉驗證選出的帶寬{cv ? `（CV-MSE ${cv.mse}）` : '（本假說無法選出）'}。
        </div>
      </Card>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
        {/* RBA-2 規格網格 */}
        <Card title="RBA-2 設定網格：階數 × 核函數">
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:'.7rem'}}>
            <thead>
              <tr style={{background:C.s2}}>
                {['多項式', '核函數', 'ATE', 'p', 'n'].map((t) => (
                  <th key={t} style={{padding:'6px 7px',textAlign:'left',color:C.dm,fontWeight:500,fontSize:'.6rem',borderBottom:`1px solid ${C.bd}`}}>{t}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {specs.map((sp, i) => (
                <tr key={i} style={{borderBottom:`1px solid ${C.bd}40`}}>
                  <td style={{padding:'5px 7px'}}>{sp.poly === 0 ? '0（均值差）' : sp.poly === 1 ? '1（線性）' : '2（二次）'}</td>
                  <td style={{padding:'5px 7px',color:C.dm}}>{KERNEL_LABELS[sp.kernel]}</td>
                  <td style={{padding:'5px 7px',fontFamily:'IBM Plex Mono,monospace',color:sp.valid?(sp.ate>0?C.gn:C.rd):C.dm,fontWeight:600}}>{sp.valid ? fmt(sp.ate) : '不可識別'}</td>
                  <td style={{padding:'5px 7px',fontFamily:'IBM Plex Mono,monospace',color:C.dm}}>{sp.valid ? fmtP(sp.p) : '—'}</td>
                  <td style={{padding:'5px 7px',fontFamily:'IBM Plex Mono,monospace',color:C.dm}}>{sp.nc}/{sp.nt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        {/* RBA-4 Donut */}
        <Card title="RBA-4 Donut-hole：剔除斷點附近觀測">
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:'.7rem'}}>
            <thead>
              <tr style={{background:C.s2}}>
                {['剔除半徑', 'ATE', 'p', '對照n', '處置n'].map((t) => (
                  <th key={t} style={{padding:'6px 7px',textAlign:'left',color:C.dm,fontWeight:500,fontSize:'.6rem',borderBottom:`1px solid ${C.bd}`}}>{t}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {donut.map((d, i) => (
                <tr key={i} style={{borderBottom:`1px solid ${C.bd}40`}}>
                  <td style={{padding:'5px 7px',fontFamily:'IBM Plex Mono,monospace'}}>{d.donut === 0 ? '不剔除' : `|rv| < ${d.donut}`}</td>
                  <td style={{padding:'5px 7px',fontFamily:'IBM Plex Mono,monospace',color:d.valid?(d.ate>0?C.gn:C.rd):C.dm,fontWeight:600}}>{d.valid ? fmt(d.ate) : '不可識別'}</td>
                  <td style={{padding:'5px 7px',fontFamily:'IBM Plex Mono,monospace',color:C.dm}}>{d.valid ? fmtP(d.p) : '—'}</td>
                  <td style={{padding:'5px 7px',textAlign:'center'}}>{d.nc}</td>
                  <td style={{padding:'5px 7px',textAlign:'center'}}>{d.nt}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{fontSize:'.66rem',color:C.dm,marginTop:8,lineHeight:1.65}}>
            若剔除最靠近斷點的觀測後 ATE 大幅改變，代表估計由少數邊界點驅動。
          </div>
        </Card>
      </div>

      {/* RBA-3 安慰劑斷點 */}
      <Card title="RBA-3 安慰劑斷點：把斷點移到別處，效果應該消失">
        <ResponsiveContainer width="100%" height={175}>
          <BarChart data={placebo.rows}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.bd} opacity={0.5}/>
            <XAxis dataKey="cut" tick={{fill:C.dm,fontSize:8}} label={{value:'假設的斷點位置',position:'insideBottom',fill:C.dm,fontSize:9,offset:-3}}/>
            <YAxis tick={{fill:C.dm,fontSize:9}} tickFormatter={(v)=>`${v}%`}/>
            <Tooltip contentStyle={{background:C.s1,border:`1px solid ${C.bd}`,fontSize:'.72rem'}}
              formatter={(v)=>[v === null ? '不可識別' : `${v}%`, 'ATE']}
              labelFormatter={(l)=>`斷點 = ${l}`}/>
            <ReferenceLine y={0} stroke={C.dm} opacity={0.5}/>
            <ReferenceLine x={hyp.threshold} stroke={C.yw} strokeDasharray="4 4" label={{value:'真斷點',fill:C.yw,fontSize:9,position:'top'}}/>
            <Bar dataKey="ate" name="ATE">
              {placebo.rows.map((row, i) => (
                <Cell key={i} fill={row.isTrue ? C.yw : row.near ? C.dm : hyp.color} opacity={row.isTrue ? 1 : row.near ? 0.35 : 0.6}/>
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div style={{fontSize:'.7rem',color:C.tx,marginTop:6,lineHeight:1.75}}>
          真斷點 ATE = <strong style={{color:placebo.trueAte === null ? C.rd : C.yw}}>{placebo.trueAte === null ? '不可識別' : fmt(placebo.trueAte)}</strong>；
          在 {placebo.nFar} 個遠離真斷點的假斷點中，有 <strong style={{color:placebo.p !== null && placebo.p <= 0.1 ? C.gn : C.rd}}>{placebo.extreme}</strong> 個的效果不小於真斷點
          → 安慰劑 p = <strong style={{color:placebo.p !== null && placebo.p <= 0.1 ? C.gn : C.rd}}>{placebo.p ?? '—'}</strong>。
          灰柱為距真斷點過近、與真斷點共用樣本而未納入比較的位置。
        </div>
      </Card>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
        {/* RBA-5 Jackknife */}
        <Card title="RBA-5 刀切法：逐季剔除後的 ATE">
          <ResponsiveContainer width="100%" height={165}>
            <BarChart data={jackData}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.bd} opacity={0.5}/>
              <XAxis dataKey="year" tick={{fill:C.dm,fontSize:8}}/>
              <YAxis tick={{fill:C.dm,fontSize:9}} tickFormatter={(v)=>`${v}%`}/>
              <Tooltip contentStyle={{background:C.s1,border:`1px solid ${C.bd}`,fontSize:'.72rem'}}
                formatter={(v)=>[v === null ? '不可識別' : `${v}%`, '剔除後 ATE']}
                labelFormatter={(l)=>`剔除 ${l} 颶風季`}/>
              {jack.full !== null && <ReferenceLine y={jack.full} stroke={C.yw} strokeDasharray="4 4" label={{value:'全樣本',fill:C.yw,fontSize:9,position:'right'}}/>}
              <Bar dataKey="ate" fill={hyp.color} opacity={0.65} name="剔除後 ATE"/>
            </BarChart>
          </ResponsiveContainer>
          <div style={{fontSize:'.68rem',color:C.dm,marginTop:6,lineHeight:1.65}}>
            全樣本 ATE = {fmt(jack.full)}｜刀切標準誤 = {jack.seJack || '—'}｜
            剔除後範圍 {jack.min === null ? '—' : `${jack.min}% ~ ${jack.max}%`}
          </div>
        </Card>

        {/* RBA-6 隨機化推論 */}
        <Card title="RBA-6 隨機化推論：置換分布 vs 實際估計">
          {ri.valid ? (
            <>
              <ResponsiveContainer width="100%" height={165}>
                <BarChart data={riHist}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.bd} opacity={0.5}/>
                  <XAxis dataKey="mid" tick={{fill:C.dm,fontSize:8}} label={{value:'置換樣本的 ATE',position:'insideBottom',fill:C.dm,fontSize:9,offset:-3}}/>
                  <YAxis tick={{fill:C.dm,fontSize:9}}/>
                  <Tooltip contentStyle={{background:C.s1,border:`1px solid ${C.bd}`,fontSize:'.72rem'}}
                    formatter={(v)=>[`${v} 次`,'次數']} labelFormatter={(l)=>`ATE ≈ ${l}%`}/>
                  <ReferenceLine x={riHist.reduce((best, b) => (Math.abs(b.mid - ri.obs) < Math.abs(best.mid - ri.obs) ? b : best), riHist[0]).mid}
                    stroke={C.yw} strokeWidth={2} label={{value:'實際',fill:C.yw,fontSize:9,position:'top'}}/>
                  <Bar dataKey="n" name="次數">
                    {riHist.map((b, i) => <Cell key={i} fill={b.extreme ? C.rd : hyp.color} opacity={b.extreme ? 0.75 : 0.5}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div style={{fontSize:'.7rem',color:C.tx,marginTop:6,lineHeight:1.7}}>
                在「跨斷點無跳躍」的虛無假設下重排殘差 {ri.draws} 次，
                有 <strong style={{color:C.rd}}>{Math.round(ri.p * (ri.draws + 1)) - 1}</strong> 次的 |ATE| 不小於實際估計
                → p = <strong style={{color:ri.p <= 0.05 ? C.gn : C.yw}}>{ri.p}</strong>（紅柱為比實際更極端的區域）。
              </div>
            </>
          ) : (
            <div style={{fontSize:'.73rem',color:C.rd,lineHeight:1.8,padding:'12px 0'}}>
              帶寬窗內樣本不足，無法執行置換檢定（需窗內至少 4 個觀測且兩側都有資料）。
              這本身就是識別失敗的訊號，不是技術問題。
            </div>
          )}
        </Card>
      </div>

      {/* 方法註記 */}
      <Card title="📎 方法與限制註記">
        <ul style={{margin:0,paddingLeft:18,fontSize:'.71rem',lineHeight:1.95,color:C.tx}}>
          <li>p 值由 Student-t 分布（正則化不完全 Beta 函數）計算，取代舊版的指數近似式；標準誤為 HC1 異質變異數穩健三明治估計。</li>
          <li>帶寬選擇提供經驗法則（1.84·SD·n^(−1/5)）與留一交叉驗證兩種。本專案<strong>未</strong>實作 IK/CCT 的 MSE 最適帶寬與偏誤修正信賴區間 — 在 n=14 下這些漸近公式本來就不適用，硬套只會給出看似精確的假象。</li>
          <li>隨機化推論採 Freedman–Lane 殘差置換：先配適無跳躍的虛無模型，再重排殘差。直接洗牌結果變數會把跑動變數的斜率誤算成處置變異，使檢定過度保守。</li>
          <li>安慰劑斷點掃描跑動變數的第 20~80 百分位，排除距真斷點 h/2 以內的位置以免共用樣本。</li>
          <li>本頁所有估計皆為銳型（sharp）RDD。若颶風天數跨越斷點只是「機率上」影響停工，正確設定應為模糊型（fuzzy）RDD 並改用兩階段最小平方。</li>
        </ul>
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
  {id:'rba', label:'🧪 穩健性 RBA', comp:RobustnessAnalysis},
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
            style={{padding:'10px 12px',fontSize:'.76rem',cursor:'pointer',color:tab===t.id?C.cy:C.dm,background:'transparent',border:'none',borderBottom:`2px solid ${tab===t.id?C.cy:'transparent'}`,whiteSpace:'nowrap',transition:'all .15s',flexShrink:0,fontFamily:'inherit'}}>
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
