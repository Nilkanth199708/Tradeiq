import { useState, useRef, useCallback, useEffect } from "react";

const INST = {
  FOREX: {
    label: "Forex", color: "#00e5a0", short: "FX",
    items: ["EUR/USD","GBP/USD","USD/JPY","AUD/USD","USD/CAD","USD/CHF","NZD/USD","EUR/GBP","EUR/JPY","GBP/JPY"],
    tfs: ["M15","M30","H1","H4","D1"], dTFs: ["H1","H4","D1"],
    ctx: "Forex. Analise tendencia, suporte, resistencia e padroes de candles.",
  },
  VOLATILITY: {
    label: "Volatility", color: "#a78bfa", short: "VL",
    items: ["Volatility 10","Volatility 25","Volatility 50","Volatility 75","Volatility 100","Volatility 10s","Volatility 25s","Volatility 50s","Volatility 75s","Volatility 100s"],
    tfs: ["M1","M5","M15","M30","H1"], dTFs: ["M5","M15","H1"],
    ctx: "Indice Sintetico Volatility Deriv. Opera 24/7. Analise tendencia, padroes e suporte/resistencia.",
  },
  CRASH: {
    label: "Crash", color: "#ff4d6d", short: "CR",
    items: ["Crash 300","Crash 500","Crash 1000"],
    tfs: ["M1","M5","M15","M30"], dTFs: ["M1","M5","M15"],
    ctx: "Crash Deriv. Spikes de queda bruscos. Sinal VENDA e mais favoravel. Stop loss e CRITICO.",
  },
  BOOM: {
    label: "Boom", color: "#f5c518", short: "BM",
    items: ["Boom 300","Boom 500","Boom 1000"],
    tfs: ["M1","M5","M15","M30"], dTFs: ["M1","M5","M15"],
    ctx: "Boom Deriv. Spikes de alta bruscos. Sinal COMPRA e mais favoravel. Stop loss e CRITICO.",
  },
  STEP: {
    label: "Step/Jump", color: "#38bdf8", short: "SJ",
    items: ["Step Index","Jump 10","Jump 25","Jump 50","Jump 75","Jump 100"],
    tfs: ["M1","M5","M15","H1"], dTFs: ["M5","M15","H1"],
    ctx: "Step/Jump Deriv. Step: movimentos de 0.1 pip. Jump: saltos repentinos. Analise tendencia.",
  },
};

const makePrompt = (tf, instrument, instType) =>
  "Voce e analista tecnico de " + instrument + " no timeframe " + tf + ". " +
  (INST[instType]?.ctx || "") +
  " Retorne APENAS JSON sem markdown: " +
  '{"timeframe":"' + tf + '","instrumento":"' + instrument + '",' +
  '"tendencia":"ALTA","forca_tendencia":70,"probabilidade_alta":60,' +
  '"probabilidade_baixa":25,"probabilidade_lateral":15,' +
  '"sinal":"COMPRA","confianca":75,"suporte":null,"resistencia":null,' +
  '"padroes":[],"alerta_spike":false,"risco":"MEDIO","resumo":"Analise.",' +
  '"entry_ideal":null,"stop_loss":null,"take_profit":null,"aviso_risco":null}';

const callClaude = async (b64, tf, instrument, instType) => {
 const res = await fetch("/api/analyze", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: makePrompt(tf, instrument, instType),
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 } },
        { type: "text", text: "Analise este grafico de " + instrument + " timeframe " + tf + ". Retorne o JSON." }
      ]}]
    })
  });
  const data = await res.json();
  const raw = data.content?.map(b => b.text || "").join("").trim().replace(/```json|```/g, "").trim();
  return JSON.parse(raw);
};

const sigC  = s => s === "COMPRA" ? "#00e5a0" : s === "VENDA" ? "#ff4d6d" : "#f5c518";
const tendC = t => t === "ALTA"   ? "#00e5a0" : t === "BAIXA" ? "#ff4d6d" : "#f5c518";
const confC = v => v >= 65 ? "#00e5a0" : v >= 40 ? "#f5c518" : "#ff4d6d";
const riskC = r => r === "ALTO"   ? "#ff4d6d" : r === "MEDIO" ? "#f5c518" : "#00e5a0";
const rcRes = r => r === "WIN"    ? "#00e5a0" : r === "LOSS"  ? "#ff4d6d" : "#f5c518";
const fmt   = iso => new Date(iso).toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", year:"2-digit", hour:"2-digit", minute:"2-digit" });
const loadLS = k => { try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch { return []; } };
const saveLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const HK = "tiq_hist";
const BK = "tiq_bt";

function calcCons(results) {
  const v = Object.values(results).filter(Boolean);
  if (!v.length) return null;
  const c = { COMPRA:0, VENDA:0, AGUARDAR:0 };
  v.forEach(r => c[r.sinal]++);
  const d = Object.entries(c).sort((a,b) => b[1]-a[1])[0];
  const ag = Math.round((d[1]/v.length)*100);
  const tc = { ALTA:0, BAIXA:0, LATERAL:0 };
  v.forEach(r => tc[r.tendencia]++);
  const dt = Object.entries(tc).sort((a,b) => b[1]-a[1])[0];
  return {
    sinal: d[0], agreement: ag,
    qual: ag === 100 ? "FORTE" : ag >= 67 ? "MODERADO" : "FRACO",
    conf: Math.round(v.reduce((a,r) => a+r.confianca, 0)/v.length),
    pa: Math.round(v.reduce((a,r) => a+r.probabilidade_alta, 0)/v.length),
    pb: Math.round(v.reduce((a,r) => a+r.probabilidade_baixa, 0)/v.length),
    pl: Math.round(v.reduce((a,r) => a+r.probabilidade_lateral, 0)/v.length),
    tend: dt[0], analyzed: v.length,
    spike: v.some(r => r.alerta_spike),
    risco: v.some(r => r.risco === "ALTO") ? "ALTO" : v.some(r => r.risco === "MEDIO") ? "MEDIO" : "BAIXO",
  };
}

function calcSt(trades) {
  const cl = trades.filter(t => t.result);
  if (!cl.length) return null;
  const w = cl.filter(t => t.result === "WIN").length;
  const l = cl.filter(t => t.result === "LOSS").length;
  const b = cl.filter(t => t.result === "BREAKEVEN").length;
  const wr = Math.round((w/cl.length)*100);
  const rr = cl.filter(t => t.result === "WIN" && t.rr).reduce((a,t) => a+parseFloat(t.rr), 0) / (w||1);
  const ex = ((wr/100)*rr) - (l/cl.length);
  const bi = {}, bt = {};
  cl.forEach(t => {
    if (!bi[t.inst]) bi[t.inst] = {w:0,n:0};
    bi[t.inst].n++;
    if (t.result === "WIN") bi[t.inst].w++;
    if (!bt[t.tf]) bt[t.tf] = {w:0,n:0};
    bt[t.tf].n++;
    if (t.result === "WIN") bt[t.tf].w++;
  });
  return { total:trades.length, closed:cl.length, w, l, b, wr, rr:rr.toFixed(2), ex:ex.toFixed(2), bi, bt };
}

const DF = { minAg:67, minCf:65, minPr:60, minTF:2, hiRisk:false, noSpike:true, cTrend:false };

function runF(cons, results, cfg, itype) {
  if (!cons || !results) return null;
  const v = Object.values(results).filter(Boolean);
  const mp = Math.max(cons.pa, cons.pb);
  const tal = (cons.sinal==="COMPRA"&&cons.tend==="ALTA")||(cons.sinal==="VENDA"&&cons.tend==="BAIXA")||cons.sinal==="AGUARDAR";
  const ch = [
    { id:"ag",  lbl:"Acordo entre Timeframes",   det:cons.agreement+"% (min "+cfg.minAg+"%)",  ok:cons.agreement>=cfg.minAg,  w:25 },
    { id:"cf",  lbl:"Confianca da IA",            det:cons.conf+"% (min "+cfg.minCf+"%)",        ok:cons.conf>=cfg.minCf,        w:20 },
    { id:"pr",  lbl:"Probabilidade Direcional",   det:mp+"% (min "+cfg.minPr+"%)",               ok:mp>=cfg.minPr,               w:20 },
    { id:"sg",  lbl:"Sinal Definido",             det:cons.sinal==="AGUARDAR"?"IA sugere esperar":"Sinal: "+cons.sinal, ok:cons.sinal!=="AGUARDAR", w:15 },
    { id:"tf",  lbl:"Timeframes Analisados",      det:cons.analyzed+" TF(s) (min "+cfg.minTF+")", ok:cons.analyzed>=cfg.minTF, w:10 },
    { id:"rk",  lbl:"Nivel de Risco",             det:"Risco "+cons.risco,                        ok:cfg.hiRisk||cons.risco!=="ALTO", w:10 },
  ];
  if (["CRASH","BOOM"].includes(itype) && cfg.noSpike) {
    ch.push({ id:"sp", lbl:"Alerta de Spike", det:cons.spike?"Spike detectado":"Sem spike", ok:!cons.spike, w:0 });
  }
  ch.push({ id:"tr", lbl:"Sinal Alinhado a Tendencia", det:tal?cons.sinal+"+"+cons.tend:cons.sinal+" contra "+cons.tend, ok:cfg.cTrend?true:tal, w:0, adv:true });
  const req = ch.filter(c => !c.adv && c.w > 0);
  const pass = req.filter(c => c.ok).length;
  return { ch, score:Math.round((pass/req.length)*100), all:req.every(c=>c.ok), pass, total:req.length };
}

const Bars = ({ a, b, l }) => (
  <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
    {[{n:"Alta",v:a,c:"#00e5a0"},{n:"Baixa",v:b,c:"#ff4d6d"},{n:"Lateral",v:l,c:"#f5c518"}].map(({n,v,c}) => (
      <div key={n}>
        <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, marginBottom:3 }}>
          <span style={{ color:"#243650" }}>{n}</span><span style={{ color:c }}>{v}%</span>
        </div>
        <div style={{ background:"#0a1020", borderRadius:3, height:6, overflow:"hidden" }}>
          <div style={{ height:"100%", borderRadius:3, background:c, width:v+"%", transition:"width 1s" }} />
        </div>
      </div>
    ))}
  </div>
);

const Ring = ({ score, ok }) => {
  const r=42, ci=2*Math.PI*r, fi=(score/100)*ci;
  const col = ok?"#00e5a0":score>=66?"#f5c518":"#ff4d6d";
  return (
    <div style={{ position:"relative", width:100, height:100, flexShrink:0 }}>
      <svg width={100} height={100} style={{ transform:"rotate(-90deg)" }}>
        <circle cx={50} cy={50} r={r} fill="none" stroke="#0a1525" strokeWidth={7} />
        <circle cx={50} cy={50} r={r} fill="none" stroke={col} strokeWidth={7}
          strokeDasharray={fi+" "+(ci-fi)} strokeLinecap="round" style={{ transition:"stroke-dasharray 1s" }} />
      </svg>
      <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
        <div style={{ fontSize:24, fontWeight:800, color:col, lineHeight:1 }}>{score}</div>
        <div style={{ fontSize:8, color:"#243650", letterSpacing:1.5 }}>SCORE</div>
      </div>
    </div>
  );
};

const Verdict = ({ ok, score, sinal }) => {
  if (ok) return (
    <div style={{ padding:"14px 18px", background:"#00e5a012", border:"2px solid #00e5a055", borderRadius:8, display:"flex", alignItems:"center", gap:14 }}>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:16, fontWeight:800, color:"#00e5a0" }}>SINAL LIBERADO</div>
        <div style={{ fontSize:10, color:"#4a7090", marginTop:2 }}>Todos os filtros aprovados - Entrada de <span style={{ color:"#00e5a0" }}>{sinal}</span></div>
      </div>
      <div style={{ fontSize:28, fontWeight:800, color:"#00e5a0" }}>GO</div>
    </div>
  );
  if (score >= 66) return (
    <div style={{ padding:"14px 18px", background:"#f5c51810", border:"2px solid #f5c51855", borderRadius:8, display:"flex", alignItems:"center", gap:14 }}>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:16, fontWeight:800, color:"#f5c518" }}>SINAL PARCIAL</div>
        <div style={{ fontSize:10, color:"#4a7090", marginTop:2 }}>Alguns filtros falharam - Reduza a posicao</div>
      </div>
      <div style={{ fontSize:28, fontWeight:800, color:"#f5c518" }}>??</div>
    </div>
  );
  return (
    <div style={{ padding:"14px 18px", background:"#ff4d6d10", border:"2px solid #ff4d6d55", borderRadius:8, display:"flex", alignItems:"center", gap:14 }}>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:16, fontWeight:800, color:"#ff4d6d" }}>ENTRADA BLOQUEADA</div>
        <div style={{ fontSize:10, color:"#4a7090", marginTop:2 }}>Muitos filtros falharam - Aguarde melhor setup</div>
      </div>
      <div style={{ fontSize:28, fontWeight:800, color:"#ff4d6d" }}>NO</div>
    </div>
  );
};

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  ::-webkit-scrollbar{width:3px} ::-webkit-scrollbar-thumb{background:#1e2d42}
  body{background:#070c15}
  .card{background:#0b1120;border:1px solid #141f30;border-radius:8px;padding:16px}
  .lbl{font-size:9px;letter-spacing:2.5px;color:#243650;text-transform:uppercase;margin-bottom:6px;font-family:'JetBrains Mono',monospace}
  .gbtn{background:none;border:1px solid #1e2d42;color:#4a6080;padding:8px 14px;font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:1.5px;cursor:pointer;border-radius:5px;transition:.2s}
  .gbtn:hover{color:#00e5a0;border-color:#00e5a0}
  .nbtn{background:none;border:none;cursor:pointer;font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:2px;padding:8px 12px;border-radius:4px;transition:all .2s;white-space:nowrap}
  .ibtn{background:none;border:1px solid #141f30;color:#243650;font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:1.5px;cursor:pointer;border-radius:5px;padding:7px 12px;transition:all .2s}
  .tbtn{padding:5px 10px;border-radius:4px;font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:1.5px;cursor:pointer;border:1px solid #141f30;background:none;color:#243650;transition:.2s}
  .tabbtn{padding:7px 12px;font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:1.5px;cursor:pointer;border-radius:4px;border:1px solid transparent;background:none;color:#243650;transition:.2s}
  .tabbtn.on{background:#0d1a2a;border-color:currentColor}
  .inp{background:#0a1020;border:1px solid #1e2d42;color:#c8d8ea;padding:10px 12px;border-radius:5px;font-family:'JetBrains Mono',monospace;font-size:11px;outline:none;transition:.2s;width:100%}
  .inp:focus{border-color:#00e5a0}
  select.inp option{background:#0a1020}
  .hcard{background:#0b1120;border:1px solid #141f30;border-radius:8px;padding:14px;cursor:pointer;transition:all .2s}
  .hcard:hover{border-color:#1e2d42;background:#0d1528}
  .hcard.sel{border-color:#00e5a066}
  .fi{animation:fi .3s ease} @keyframes fi{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
  .pu{animation:pu 1.5s infinite} @keyframes pu{0%,100%{opacity:1}50%{opacity:.3}}
  .sp{animation:sp 1s linear infinite} @keyframes sp{from{transform:rotate(0)}to{transform:rotate(360deg)}}
  textarea.inp{resize:vertical}
  .tgl{width:38px;height:20px;border-radius:10px;cursor:pointer;position:relative;transition:.2s;flex-shrink:0}
  .tgl-k{position:absolute;top:3px;width:14px;height:14px;border-radius:50%;background:#fff;transition:left .2s}
`;

export default function TradeIQ() {
  const [page, setPage]     = useState("analyzer");
  const [itype, setItype]   = useState("FOREX");
  const [inst, setInst]     = useState("EUR/USD");
  const [tfs, setTfs]       = useState(["H1","H4","D1"]);
  const [img, setImg]       = useState(null);
  const [b64, setB64]       = useState(null);
  const [res, setRes]       = useState({});
  const [load, setLoad]     = useState({});
  const [errs, setErrs]     = useState({});
  const [drag, setDrag]     = useState(false);
  const [atab, setAtab]     = useState("C");
  const [note, setNote]     = useState("");
  const [showN, setShowN]   = useState(false);
  const [ftab, setFtab]     = useState("c");
  const [fcfg, setFcfg]     = useState(DF);
  const [showF, setShowF]   = useState(false);
  const [hist, setHist]     = useState(() => loadLS(HK));
  const [sHist, setSHist]   = useState(null);
  const [btt, setBtt]       = useState(() => loadLS(BK));
  const [bview, setBview]   = useState("stats");
  const [bedit, setBedit]   = useState(null);
  const [bform, setBform]   = useState({ inst:"EUR/USD", tf:"H1", sinal:"COMPRA", itype:"FOREX", conf:70, rr:"", result:"", nota:"", date:new Date().toISOString().slice(0,16) });
  const fref = useRef();

  useEffect(() => { saveLS(HK, hist.slice(0,60)); }, [hist]);
  useEffect(() => { saveLS(BK, btt); }, [btt]);

  const cfg     = INST[itype];
  const cons    = calcCons(res);
  const fres    = runF(cons, res, fcfg, itype);
  const busy    = Object.values(load).some(Boolean);
  const hasR    = Object.keys(res).length > 0;
  const bstats  = calcSt(btt);
  const ic      = cfg.color;
  const tfr     = atab !== "C" ? res[atab] : null;

  const changeI = t => { setItype(t); setInst(INST[t].items[0]); setTfs(INST[t].dTFs); setRes({}); setErrs({}); setAtab("C"); };
  const togTF   = tf => setTfs(p => p.includes(tf) ? (p.length>1?p.filter(t=>t!==tf):p) : [...p,tf]);

  const onFile = useCallback(file => {
    if (!file?.type.startsWith("image/")) return;
    setImg(URL.createObjectURL(file));
    setRes({}); setErrs({}); setAtab("C"); setNote(""); setShowN(false);
    const r = new FileReader();
    r.onload = e => setB64(e.target.result.split(",")[1]);
    r.readAsDataURL(file);
  }, []);

  const analyze = async () => {
    if (!b64) return;
    setRes({}); setErrs({});
    const ls = {}; tfs.forEach(tf => ls[tf] = true); setLoad(ls);
    await Promise.all(tfs.map(async tf => {
      try { const r = await callClaude(b64, tf, inst, itype); setRes(p => ({...p,[tf]:r})); }
      catch { setErrs(p => ({...p,[tf]:true})); }
      finally { setLoad(p => ({...p,[tf]:false})); }
    }));
  };

  const saveH = () => {
    if (!cons) return;
    setHist(p => [{id:Date.now(),date:new Date().toISOString(),img,inst,itype,cons,res:{...res},note},...p]);
    setShowN(false); setNote(""); alert("Analise salva!");
  };

  const bsave = () => {
    if (bedit) { setBtt(p=>p.map(t=>t.id===bedit?{...bform,id:bedit}:t)); setBedit(null); }
    else { setBtt(p=>[{...bform,id:Date.now()},...p]); }
    setBform({inst:"EUR/USD",tf:"H1",sinal:"COMPRA",itype:"FOREX",conf:70,rr:"",result:"",nota:"",date:new Date().toISOString().slice(0,16)});
    setBview("log");
  };

  return (
    <div style={{ minHeight:"100vh", background:"#070c15", color:"#c8d8ea", fontFamily:"Outfit, sans-serif" }}>
      <style>{CSS}</style>

      {/* NAV */}
      <div style={{ borderBottom:"1px solid #101a28", padding:"11px 18px", display:"flex", alignItems:"center", gap:10, position:"sticky", top:0, background:"rgba(7,12,21,.95)", backdropFilter:"blur(10px)", zIndex:100 }}>
        <div style={{ display:"flex", gap:5 }}>
          {["#00e5a0","#f5c518","#ff4d6d"].map(c=><div key={c} style={{ width:7, height:7, borderRadius:"50%", background:c, opacity:.8 }}/>)}
        </div>
        <span style={{ fontSize:17, fontWeight:800, color:"#fff" }}>Trade<span style={{ color:ic }}>IQ</span></span>
        <div style={{ marginLeft:"auto", display:"flex", gap:2 }}>
          {[["analyzer","Analise"],["history","Historico"],["backtest","Stats"]].map(([v,l])=>(
            <button key={v} className="nbtn" onClick={()=>setPage(v)}
              style={{ color:page===v?ic:"#243650", borderBottom:page===v?"1px solid "+ic:"1px solid transparent" }}>{l}</button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth:1100, margin:"0 auto", padding:"16px 14px" }}>

        {/* ===== ANALYZER ===== */}
        {page==="analyzer" && (
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            {/* Instrument picker */}
            <div className="card fi" style={{ padding:14 }}>
              <div className="lbl" style={{ marginBottom:10 }}>Instrumento</div>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:14 }}>
                {Object.entries(INST).map(([k,v])=>(
                  <button key={k} className="ibtn" onClick={()=>changeI(k)}
                    style={{ borderColor:itype===k?v.color:"#141f30", color:itype===k?v.color:"#243650", background:itype===k?v.color+"15":"none" }}>
                    [{v.short}] {v.label}
                  </button>
                ))}
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <div>
                  <div className="lbl">Par / Indice</div>
                  <select className="inp" value={inst} onChange={e=>setInst(e.target.value)}>
                    {cfg.items.map(i=><option key={i}>{i}</option>)}
                  </select>
                </div>
                <div>
                  <div className="lbl">Timeframes</div>
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap", paddingTop:4 }}>
                    {cfg.tfs.map(tf=>(
                      <button key={tf} className="tbtn" onClick={()=>togTF(tf)}
                        style={{ color:tfs.includes(tf)?ic:"#243650", borderColor:tfs.includes(tf)?ic:"#141f30", background:tfs.includes(tf)?ic+"15":"none" }}>
                        {tf}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Main grid */}
            <div style={{ display:"grid", gridTemplateColumns:img?"300px 1fr":"1fr", gap:14 }}>
              {/* Left */}
              <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                {!img ? (
                  <div onClick={()=>fref.current.click()}
                    onDragOver={e=>{e.preventDefault();setDrag(true);}}
                    onDragLeave={()=>setDrag(false)}
                    onDrop={e=>{e.preventDefault();setDrag(false);onFile(e.dataTransfer.files[0]);}}
                    style={{ border:"1px dashed "+(drag?ic:"#1e2d42"), background:drag?ic+"05":"#0b1120", cursor:"pointer", textAlign:"center", padding:"48px 20px", borderRadius:8, transition:".2s" }}>
                    <div style={{ fontSize:32, marginBottom:14 }}>[ ]</div>
                    <div style={{ fontSize:13, color:"#4a6080" }}>Arraste o grafico aqui</div>
                    <div style={{ fontSize:10, color:"#1e2d42", marginTop:6 }}>PNG - JPG - WEBP</div>
                  </div>
                ) : (
                  <div style={{ position:"relative", borderRadius:8, overflow:"hidden", border:"1px solid #141f30" }}>
                    <img src={img} alt="chart" style={{ width:"100%", display:"block" }} />
                    {busy && (
                      <div style={{ position:"absolute", inset:0, background:"rgba(7,12,21,.82)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:14 }}>
                        <div className="sp" style={{ width:30, height:30, border:"2px solid #0a1020", borderTop:"2px solid "+ic, borderRadius:"50%" }}/>
                        <div className="pu" style={{ fontSize:10, letterSpacing:3, color:ic }}>ANALISANDO...</div>
                        <div style={{ display:"flex", gap:6 }}>
                          {tfs.map(tf=>(
                            <div key={tf} style={{ fontSize:9, padding:"3px 8px", borderRadius:3, border:"1px solid "+(res[tf]?ic:load[tf]?"#f5c518":"#1e2d42"), color:res[tf]?ic:load[tf]?"#f5c518":"#1e2d42" }}>
                              {res[tf]?"OK":load[tf]?"...":"-"} {tf}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <button onClick={()=>{setImg(null);setB64(null);setRes({});}}
                      style={{ position:"absolute", top:8, right:8, background:"#ff4d6d22", border:"1px solid #ff4d6d55", color:"#ff4d6d", width:24, height:24, borderRadius:4, cursor:"pointer", fontSize:13 }}>
                      x
                    </button>
                  </div>
                )}

                <input ref={fref} type="file" accept="image/*" style={{ display:"none" }} onChange={e=>onFile(e.target.files[0])} />

                {img && (
                  <button onClick={analyze} disabled={busy}
                    style={{ background:busy?"#0d1528":ic, color:busy?"#243650":"#05080e", width:"100%", border:"none", padding:"10px 18px", fontFamily:"JetBrains Mono,monospace", fontSize:11, fontWeight:500, letterSpacing:2, cursor:busy?"not-allowed":"pointer", borderRadius:5, transition:".2s" }}>
                    {busy?"PROCESSANDO...":"ANALISAR "+tfs.join(" / ")}
                  </button>
                )}

                {(hasR||busy) && tfs.map(tf=>{
                  const r = res[tf];
                  return (
                    <div key={tf} className="card" style={{ display:"flex", alignItems:"center", gap:10, cursor:r?"pointer":"default", borderColor:atab===tf?ic+"55":"#141f30", padding:11 }} onClick={()=>r&&setAtab(tf)}>
                      <span style={{ fontSize:13, fontWeight:700, color:"#4a6080", width:30 }}>{tf}</span>
                      {load[tf] && <div className="sp" style={{ width:12, height:12, border:"1.5px solid #0a1020", borderTop:"1.5px solid "+ic, borderRadius:"50%" }}/>}
                      {r && <>
                        <span style={{ fontSize:11, color:sigC(r.sinal), fontWeight:500 }}>{r.sinal}</span>
                        <span style={{ fontSize:10, color:tendC(r.tendencia), marginLeft:"auto" }}>{r.tendencia}</span>
                        <span style={{ fontSize:10, color:confC(r.confianca) }}>{r.confianca}%</span>
                      </>}
                      {errs[tf] && <span style={{ fontSize:10, color:"#ff4d6d" }}>erro</span>}
                      {!load[tf]&&!r&&!errs[tf] && <span style={{ fontSize:10, color:"#1e2d42" }}>aguardando</span>}
                    </div>
                  );
                })}

                {hasR && !busy && cons && (
                  <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                    {showN && <textarea className="inp fi" rows={3} placeholder="Anotacao pessoal..." value={note} onChange={e=>setNote(e.target.value)} />}
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                      <button className="gbtn" onClick={()=>setShowN(v=>!v)}>{showN?"Fechar Nota":"+ Nota"}</button>
                      <button onClick={saveH} style={{ background:ic, color:"#05080e", border:"none", padding:"9px 18px", fontFamily:"JetBrains Mono,monospace", fontSize:11, fontWeight:500, letterSpacing:2, cursor:"pointer", borderRadius:5 }}>Salvar</button>
                    </div>
                  </div>
                )}

                {!img && (
                  <div className="card" style={{ fontSize:10, color:"#243650", lineHeight:2 }}>
                    <div style={{ color:ic, marginBottom:8, letterSpacing:2, fontSize:9 }}>COMO USAR</div>
                    <div>1. Selecione o instrumento</div>
                    <div>2. Escolha os timeframes</div>
                    <div>3. Upload do grafico</div>
                    <div>4. Clique em Analisar</div>
                    <div>5. Veja consenso e filtros</div>
                    <div>6. Salve e registre resultado</div>
                  </div>
                )}
              </div>

              {/* Right */}
              {(hasR||busy) && (
                <div className="fi" style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  {/* Tab bar */}
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
                    {["C",...tfs].map(t=>(
                      <button key={t} className={"tabbtn"+(atab===t&&ftab==="c"?" on":"")}
                        onClick={()=>{setAtab(t);setFtab("c");}}
                        style={{ color:atab===t&&ftab==="c"?ic:"#243650", borderColor:atab===t&&ftab==="c"?ic:"transparent" }}>
                        {t==="C"?"Consenso":t}
                        {t!=="C"&&res[t]&&<span style={{ marginLeft:4, color:sigC(res[t].sinal) }}>*</span>}
                      </button>
                    ))}
                    {cons && (
                      <button className={"tabbtn"+(ftab==="f"?" on":"")}
                        onClick={()=>setFtab("f")}
                        style={{ color:ftab==="f"?(fres?.all?"#00e5a0":fres?.score>=66?"#f5c518":"#ff4d6d"):"#243650", borderColor:ftab==="f"?(fres?.all?"#00e5a0":fres?.score>=66?"#f5c518":"#ff4d6d"):"transparent", marginLeft:"auto" }}>
                        Filtros {fres&&<span style={{ marginLeft:4, fontSize:9 }}>{fres.score}%</span>}
                      </button>
                    )}
                  </div>

                  {/* Filter tab */}
                  {ftab==="f" && fres && (
                    <div className="fi" style={{ display:"flex", flexDirection:"column", gap:12 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                        <span style={{ fontSize:11, color:"#c8d8ea", fontWeight:600 }}>Filtros de Qualidade <span style={{ fontSize:9, color:"#243650", marginLeft:6 }}>{fres.pass}/{fres.total}</span></span>
                        <button className="gbtn" onClick={()=>setShowF(v=>!v)} style={{ fontSize:9, padding:"5px 10px" }}>{showF?"Fechar":"Config"}</button>
                      </div>

                      {showF && (
                        <div className="card fi" style={{ display:"flex", flexDirection:"column", gap:14 }}>
                          {[{l:"ACORDO MINIMO",k:"minAg",mn:33,mx:100},{l:"CONFIANCA MINIMA",k:"minCf",mn:30,mx:95},{l:"PROB. DIRECIONAL",k:"minPr",mn:40,mx:80}].map(({l,k,mn,mx})=>(
                            <div key={k}>
                              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                                <span style={{ fontSize:9, color:"#4a7090", letterSpacing:1 }}>{l}</span>
                                <span style={{ fontSize:11, color:"#00e5a0", fontWeight:500 }}>{fcfg[k]}%</span>
                              </div>
                              <input type="range" min={mn} max={mx} value={fcfg[k]} onChange={e=>setFcfg(c=>({...c,[k]:parseInt(e.target.value)}))} style={{ width:"100%" }} />
                            </div>
                          ))}
                          <div>
                            <div className="lbl" style={{ marginBottom:8 }}>TFs MINIMOS</div>
                            <div style={{ display:"flex", gap:8 }}>
                              {[1,2,3].map(n=>(
                                <button key={n} onClick={()=>setFcfg(c=>({...c,minTF:n}))}
                                  style={{ flex:1, padding:8, borderRadius:4, border:"1px solid "+(fcfg.minTF===n?"#00e5a0":"#1e2d42"), background:fcfg.minTF===n?"#00e5a015":"none", color:fcfg.minTF===n?"#00e5a0":"#243650", cursor:"pointer", fontSize:11 }}>
                                  {n} TF{n>1?"s":""}
                                </button>
                              ))}
                            </div>
                          </div>
                          {[{k:"hiRisk",l:"Permitir risco ALTO"},{k:"noSpike",l:"Bloquear em spike"},{k:"cTrend",l:"Permitir contra-tendencia"}].map(({k,l})=>(
                            <div key={k} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"9px 12px", background:"#0a1020", borderRadius:5, border:"1px solid #141f30" }}>
                              <span style={{ fontSize:11, color:"#c8d8ea" }}>{l}</span>
                              <div className="tgl" style={{ background:fcfg[k]?"#00e5a0":"#1e2d42" }} onClick={()=>setFcfg(c=>({...c,[k]:!c[k]}))}>
                                <div className="tgl-k" style={{ left:fcfg[k]?21:3 }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="card" style={{ display:"flex", gap:16, alignItems:"center" }}>
                        <Ring score={fres.score} ok={fres.all} />
                        <div style={{ flex:1 }}><Verdict ok={fres.all} score={fres.score} sinal={cons.sinal} /></div>
                      </div>

                      <div className="card" style={{ padding:14 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8, fontSize:10 }}>
                          <span style={{ color:"#243650" }}>Criterios aprovados</span>
                          <span style={{ color:fres.all?"#00e5a0":fres.score>=66?"#f5c518":"#ff4d6d" }}>{fres.pass}/{fres.total}</span>
                        </div>
                        <div style={{ background:"#0a1020", borderRadius:4, height:8, overflow:"hidden", marginBottom:12 }}>
                          <div style={{ height:"100%", borderRadius:4, background:fres.all?"#00e5a0":fres.score>=66?"#f5c518":"#ff4d6d", width:(fres.pass/fres.total*100)+"%", transition:"width 1s" }} />
                        </div>
                        {fres.ch.map(c=>(
                          <div key={c.id} style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"10px 12px", background:c.adv?(c.ok?"#4a709010":"#f5c51810"):(c.ok?"#00e5a010":"#ff4d6d10"), border:"1px solid "+(c.adv?(c.ok?"#4a709022":"#f5c51822"):(c.ok?"#00e5a033":"#ff4d6d33")), borderRadius:6, marginBottom:6 }}>
                            <div style={{ width:20, height:20, borderRadius:"50%", border:"1.5px solid "+(c.adv?(c.ok?"#4a7090":"#f5c518"):(c.ok?"#00e5a0":"#ff4d6d")), display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:1 }}>
                              <span style={{ fontSize:10, color:c.adv?(c.ok?"#4a7090":"#f5c518"):(c.ok?"#00e5a0":"#ff4d6d") }}>{c.ok?"v":"x"}</span>
                            </div>
                            <div style={{ flex:1 }}>
                              <div style={{ display:"flex", justifyContent:"space-between" }}>
                                <span style={{ fontSize:11, color:"#c8d8ea", fontWeight:500 }}>{c.lbl}</span>
                                {c.adv && <span style={{ fontSize:8, color:"#f5c518", letterSpacing:1 }}>aviso</span>}
                              </div>
                              <div style={{ fontSize:10, color:c.adv?(c.ok?"#4a7090":"#f5c518"):(c.ok?"#4a7090":"#ff8fa3"), marginTop:2 }}>{c.det}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Consenso tab */}
                  {ftab==="c" && atab==="C" && cons && (
                    <div className="fi" style={{ display:"flex", flexDirection:"column", gap:12 }}>
                      <div className="card" style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14, borderColor:sigC(cons.sinal)+"33" }}>
                        <div><div className="lbl">Sinal</div><div style={{ fontSize:30, fontWeight:800, color:sigC(cons.sinal), lineHeight:1 }}>{cons.sinal}</div></div>
                        <div><div className="lbl">Acordo</div><div style={{ fontSize:30, fontWeight:800, color:confC(cons.agreement), lineHeight:1 }}>{cons.agreement}%</div><div style={{ fontSize:9, color:confC(cons.agreement), marginTop:4 }}>{cons.qual}</div></div>
                        <div><div className="lbl">Confianca</div><div style={{ fontSize:30, fontWeight:800, color:confC(cons.conf), lineHeight:1 }}>{cons.conf}%</div></div>
                      </div>
                      <div className="card">
                        <div className="lbl" style={{ marginBottom:12 }}>Acordo por timeframe</div>
                        <div style={{ display:"flex", gap:8, marginBottom:14 }}>
                          {tfs.map(tf=>{
                            const r=res[tf];
                            if(!r) return <div key={tf} style={{ flex:1, height:42, background:"#0a1020", borderRadius:5, display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, color:"#1e2d42" }}>{tf}</div>;
                            return <div key={tf} style={{ flex:1, height:42, background:sigC(r.sinal)+"15", border:"1px solid "+sigC(r.sinal)+"44", borderRadius:5, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:3, cursor:"pointer" }} onClick={()=>setAtab(tf)}>
                              <span style={{ fontSize:9, color:"#243650" }}>{tf}</span>
                              <span style={{ fontSize:11, color:sigC(r.sinal), fontWeight:600 }}>{r.sinal}</span>
                            </div>;
                          })}
                        </div>
                        <Bars a={cons.pa} b={cons.pb} l={cons.pl} />
                      </div>
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
                        <div className="card" style={{ padding:12 }}><div className="lbl">Instrumento</div><div style={{ fontSize:14, fontWeight:700, color:ic }}>{inst}</div></div>
                        <div className="card" style={{ padding:12 }}><div className="lbl">Tendencia</div><div style={{ fontSize:14, fontWeight:700, color:tendC(cons.tend) }}>{cons.tend}</div></div>
                        <div className="card" style={{ padding:12 }}><div className="lbl">Risco</div><div style={{ fontSize:14, fontWeight:700, color:riskC(cons.risco) }}>{cons.risco}</div></div>
                      </div>
                    </div>
                  )}

                  {/* TF detail tab */}
                  {ftab==="c" && atab!=="C" && tfr && (
                    <div className="fi" style={{ display:"flex", flexDirection:"column", gap:12 }}>
                      <div className="card" style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14, borderColor:sigC(tfr.sinal)+"33" }}>
                        <div><div className="lbl">Sinal {atab}</div><div style={{ fontSize:28, fontWeight:800, color:sigC(tfr.sinal) }}>{tfr.sinal}</div></div>
                        <div><div className="lbl">Tendencia</div><div style={{ fontSize:28, fontWeight:800, color:tendC(tfr.tendencia) }}>{tfr.tendencia}</div></div>
                        <div><div className="lbl">Confianca</div><div style={{ fontSize:28, fontWeight:800, color:confC(tfr.confianca) }}>{tfr.confianca}%</div></div>
                      </div>
                      <div className="card"><div className="lbl" style={{ marginBottom:10 }}>Probabilidades</div><Bars a={tfr.probabilidade_alta} b={tfr.probabilidade_baixa} l={tfr.probabilidade_lateral} /></div>
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
                        {[{l:"Entry",v:tfr.entry_ideal,c:"#c8d8ea"},{l:"Stop Loss",v:tfr.stop_loss,c:"#ff4d6d"},{l:"Take Profit",v:tfr.take_profit,c:"#00e5a0"}].map(({l,v,c})=>(
                          <div key={l} className="card" style={{ padding:12 }}><div className="lbl">{l}</div><div style={{ fontSize:13, color:c, fontWeight:600, marginTop:2 }}>{v||"---"}</div></div>
                        ))}
                      </div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
                        <div className="card" style={{ padding:12 }}><div className="lbl">Suporte</div><div style={{ color:"#00e5a0", fontSize:13, fontWeight:600 }}>{tfr.suporte||"---"}</div></div>
                        <div className="card" style={{ padding:12 }}><div className="lbl">Resistencia</div><div style={{ color:"#ff4d6d", fontSize:13, fontWeight:600 }}>{tfr.resistencia||"---"}</div></div>
                        <div className="card" style={{ padding:12 }}><div className="lbl">Risco</div><div style={{ color:riskC(tfr.risco), fontSize:13, fontWeight:600 }}>{tfr.risco||"---"}</div></div>
                      </div>
                      {tfr.padroes?.length>0 && (
                        <div className="card"><div className="lbl" style={{ marginBottom:8 }}>Padroes</div>
                          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                            {tfr.padroes.map(p=><span key={p} style={{ padding:"3px 10px", borderRadius:4, fontSize:9, background:"#0a1020", border:"1px solid #1e2d42", color:"#4a6080" }}>{p}</span>)}
                          </div>
                        </div>
                      )}
                      <div className="card"><div className="lbl" style={{ marginBottom:6 }}>Analise {atab}</div><div style={{ fontSize:11, color:"#7a90a8", lineHeight:1.8 }}>{tfr.resumo}</div></div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== HISTORY ===== */}
        {page==="history" && (
          <div className="fi" style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div><div style={{ fontSize:22, fontWeight:800, color:"#fff" }}>Historico</div><div style={{ fontSize:10, color:"#243650", marginTop:2 }}>{hist.length} analise{hist.length!==1?"s":""}</div></div>
              {hist.length>0 && <button className="gbtn" style={{ color:"#ff4d6d", borderColor:"#ff4d6d33" }} onClick={()=>{if(window.confirm("Limpar tudo?"))setHist([]);}}>Limpar</button>}
            </div>
            {hist.length===0 ? (
              <div className="card" style={{ textAlign:"center", padding:60, color:"#1e2d42" }}>
                <div style={{ fontSize:32, marginBottom:12 }}>[ ]</div>
                <div style={{ fontSize:12 }}>Nenhuma analise salva.</div>
                <button onClick={()=>setPage("analyzer")} style={{ background:"#00e5a0", color:"#05080e", border:"none", padding:"10px 24px", marginTop:20, borderRadius:5, cursor:"pointer", fontSize:11, fontWeight:500, letterSpacing:2, fontFamily:"JetBrains Mono,monospace" }}>Ir para Analise</button>
              </div>
            ) : (
              <div style={{ display:"grid", gridTemplateColumns:sHist?"300px 1fr":"repeat(auto-fill,minmax(270px,1fr))", gap:14 }}>
                <div style={{ display:"flex", flexDirection:"column", gap:10, maxHeight:"80vh", overflowY:"auto", paddingRight:4 }}>
                  {hist.map(h=>(
                    <div key={h.id} className={"hcard fi"+(sHist?.id===h.id?" sel":"")} onClick={()=>setSHist(h)}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                        <div>
                          <div style={{ fontWeight:700, color:"#fff", fontSize:14, marginBottom:3 }}>[{INST[h.itype]?.short}] {h.inst}</div>
                          <div style={{ fontSize:9, color:"#243650" }}>{fmt(h.date)}</div>
                        </div>
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          <span style={{ fontSize:11, color:sigC(h.cons.sinal), fontWeight:600 }}>{h.cons.sinal}</span>
                          <button onClick={e=>{e.stopPropagation();setHist(p=>p.filter(x=>x.id!==h.id));if(sHist?.id===h.id)setSHist(null);}} style={{ background:"none", border:"none", color:"#243650", cursor:"pointer", fontSize:14 }}>x</button>
                        </div>
                      </div>
                      <div style={{ display:"flex", gap:5 }}>
                        {Object.keys(h.res).map(tf=>{const r=h.res[tf];return <div key={tf} style={{ flex:1, padding:"4px 0", background:sigC(r.sinal)+"15", border:"1px solid "+sigC(r.sinal)+"33", borderRadius:4, textAlign:"center", fontSize:9, color:sigC(r.sinal) }}>{tf}</div>;})}
                      </div>
                      <div style={{ display:"flex", justifyContent:"space-between", marginTop:8, fontSize:10 }}>
                        <span style={{ color:"#243650" }}>acordo</span>
                        <span style={{ color:confC(h.cons.agreement) }}>{h.cons.agreement}% {h.cons.qual}</span>
                      </div>
                      {h.note && <div style={{ marginTop:8, fontSize:10, color:"#4a6080", borderTop:"1px solid #141f30", paddingTop:8, lineHeight:1.5 }}>Nota: {h.note}</div>}
                    </div>
                  ))}
                </div>
                {sHist && (
                  <div className="fi" style={{ display:"flex", flexDirection:"column", gap:12 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <div style={{ fontWeight:700, color:"#fff", fontSize:16 }}>{sHist.inst} - {fmt(sHist.date)}</div>
                      <button className="gbtn" onClick={()=>setSHist(null)}>Fechar</button>
                    </div>
                    {sHist.img && <img src={sHist.img} alt="" style={{ width:"100%", borderRadius:8, border:"1px solid #141f30" }} />}
                    <div className="card" style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12 }}>
                      <div><div className="lbl">Sinal</div><div style={{ fontSize:24, fontWeight:800, color:sigC(sHist.cons.sinal) }}>{sHist.cons.sinal}</div></div>
                      <div><div className="lbl">Acordo</div><div style={{ fontSize:24, fontWeight:800, color:confC(sHist.cons.agreement) }}>{sHist.cons.agreement}%</div></div>
                      <div><div className="lbl">Confianca</div><div style={{ fontSize:24, fontWeight:800, color:confC(sHist.cons.conf) }}>{sHist.cons.conf}%</div></div>
                    </div>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
                      {Object.entries(sHist.res).map(([tf,r])=>(
                        <div key={tf} className="card" style={{ padding:12 }}>
                          <div className="lbl">{tf}</div>
                          <div style={{ fontSize:13, color:sigC(r.sinal), fontWeight:600, marginBottom:4 }}>{r.sinal}</div>
                          <div style={{ fontSize:10, color:"#243650" }}>{r.tendencia} - {r.confianca}%</div>
                          {r.entry_ideal&&<div style={{ fontSize:10, color:"#c8d8ea", marginTop:4 }}>e: {r.entry_ideal}</div>}
                          {r.stop_loss&&<div style={{ fontSize:10, color:"#ff4d6d" }}>sl: {r.stop_loss}</div>}
                          {r.take_profit&&<div style={{ fontSize:10, color:"#00e5a0" }}>tp: {r.take_profit}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ===== BACKTEST ===== */}
        {page==="backtest" && (
          <div className="fi" style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <div style={{ display:"flex", gap:4, alignItems:"center", flexWrap:"wrap", borderBottom:"1px solid #101a28", paddingBottom:12 }}>
              {[["stats","Stats"],["log","Trades"],["add",bedit?"Editar":"+ Novo"]].map(([v,l])=>(
                <button key={v} className="nbtn" onClick={()=>setBview(v)} style={{ color:bview===v?"#00e5a0":"#243650", borderBottom:bview===v?"1px solid #00e5a0":"1px solid transparent" }}>{l}</button>
              ))}
            </div>

            {bview==="stats" && (!bstats ? (
              <div className="card" style={{ textAlign:"center", padding:60 }}>
                <div style={{ fontSize:14, fontWeight:700, color:"#fff", marginBottom:8 }}>Nenhum trade registrado</div>
                <div style={{ fontSize:11, color:"#243650", marginBottom:24, lineHeight:1.7 }}>Registre seus trades e descubra sua taxa de acerto real.</div>
                <button onClick={()=>setBview("add")} style={{ background:"#00e5a0", color:"#05080e", border:"none", padding:"10px 20px", borderRadius:5, cursor:"pointer", fontSize:11, fontWeight:500, letterSpacing:2, fontFamily:"JetBrains Mono,monospace" }}>+ Registrar Trade</button>
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
                  {[
                    {l:"Win Rate",v:bstats.wr+"%",c:bstats.wr>=55?"#00e5a0":bstats.wr>=45?"#f5c518":"#ff4d6d",s:bstats.w+"W / "+bstats.l+"L / "+bstats.b+"BE"},
                    {l:"Trades",v:bstats.closed,c:"#c8d8ea",s:(bstats.total-bstats.closed)+" aberto(s)"},
                    {l:"RR Medio",v:"1:"+bstats.rr,c:"#c8d8ea",s:"nos wins"},
                    {l:"Expectancia",v:parseFloat(bstats.ex)>0?"+"+bstats.ex+"R":bstats.ex+"R",c:parseFloat(bstats.ex)>0?"#00e5a0":"#ff4d6d",s:parseFloat(bstats.ex)>0?"sistema lucrativo":"rever estrategia"},
                  ].map(({l,v,c,s})=>(
                    <div key={l} className="card">
                      <div className="lbl">{l}</div>
                      <div style={{ fontSize:30, fontWeight:800, color:c, lineHeight:1, marginBottom:4 }}>{v}</div>
                      <div style={{ fontSize:9, color:"#243650" }}>{s}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
                  <div className="card">
                    <div className="lbl" style={{ marginBottom:12 }}>Por Instrumento</div>
                    {Object.entries(bstats.bi).sort((a,b)=>(b[1].w/b[1].n)-(a[1].w/a[1].n)).map(([k,d])=>{
                      const wr=Math.round(d.w/d.n*100);
                      return <div key={k} style={{ marginBottom:10 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, marginBottom:3 }}><span style={{ color:"#c8d8ea" }}>{k}</span><span style={{ color:wr>=55?"#00e5a0":wr>=45?"#f5c518":"#ff4d6d" }}>{wr}% ({d.n})</span></div>
                        <div style={{ background:"#0a1020", borderRadius:3, height:6, overflow:"hidden" }}><div style={{ height:"100%", borderRadius:3, background:wr>=55?"#00e5a0":wr>=45?"#f5c518":"#ff4d6d", width:wr+"%" }}/></div>
                      </div>;
                    })}
                  </div>
                  <div className="card">
                    <div className="lbl" style={{ marginBottom:12 }}>Por Timeframe</div>
                    {Object.entries(bstats.bt).sort((a,b)=>(b[1].w/b[1].n)-(a[1].w/a[1].n)).map(([k,d])=>{
                      const wr=Math.round(d.w/d.n*100);
                      return <div key={k} style={{ marginBottom:10 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, marginBottom:3 }}><span style={{ fontWeight:700, color:"#c8d8ea" }}>{k}</span><span style={{ color:wr>=55?"#00e5a0":wr>=45?"#f5c518":"#ff4d6d" }}>{wr}% ({d.n})</span></div>
                        <div style={{ background:"#0a1020", borderRadius:3, height:6, overflow:"hidden" }}><div style={{ height:"100%", borderRadius:3, background:wr>=55?"#00e5a0":wr>=45?"#f5c518":"#ff4d6d", width:wr+"%" }}/></div>
                      </div>;
                    })}
                  </div>
                </div>
              </div>
            ))}

            {bview==="log" && (
              <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <span style={{ fontSize:11, color:"#243650" }}>{btt.length} trade(s)</span>
                  <div style={{ display:"flex", gap:8 }}>
                    {btt.length>0&&<button className="gbtn" style={{ color:"#ff4d6d", borderColor:"#ff4d6d33", fontSize:10 }} onClick={()=>{if(window.confirm("Apagar tudo?"))setBtt([]);}}>Limpar</button>}
                    <button onClick={()=>{setBedit(null);setBview("add");}} style={{ background:"#00e5a0", color:"#05080e", border:"none", padding:"8px 14px", borderRadius:5, cursor:"pointer", fontSize:10, fontWeight:500, letterSpacing:2, fontFamily:"JetBrains Mono,monospace" }}>+ Novo</button>
                  </div>
                </div>
                {btt.length===0 ? <div className="card" style={{ textAlign:"center", padding:40, color:"#1e2d42", fontSize:11 }}>Nenhum trade ainda.</div> : (
                  <div style={{ background:"#0b1120", border:"1px solid #141f30", borderRadius:8, overflow:"auto" }}>
                    {btt.map(t=>(
                      <div key={t.id} style={{ display:"grid", gridTemplateColumns:"100px 120px 55px 75px 85px 1fr 75px", gap:8, padding:"11px 14px", borderBottom:"1px solid #0d1528", fontSize:11, alignItems:"center", minWidth:600 }}>
                        <div style={{ fontSize:9, color:"#243650" }}>{fmt(t.date)}</div>
                        <div style={{ color:"#c8d8ea", fontWeight:500 }}>{t.inst}</div>
                        <div style={{ color:"#4a6080", fontWeight:700 }}>{t.tf}</div>
                        <div><span style={{ padding:"2px 8px", borderRadius:3, fontSize:9, background:sigC(t.sinal)+"15", color:sigC(t.sinal), border:"1px solid "+sigC(t.sinal)+"33" }}>{t.sinal}</span></div>
                        <div>{t.result?<span style={{ padding:"2px 8px", borderRadius:3, fontSize:9, background:rcRes(t.result)+"15", color:rcRes(t.result), border:"1px solid "+rcRes(t.result)+"33" }}>{t.result}</span>:<span style={{ fontSize:9, color:"#1e2d42" }}>ABERTO</span>}</div>
                        <div style={{ fontSize:10, color:"#3a5070", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{t.nota||"---"}</div>
                        <div style={{ display:"flex", gap:4 }}>
                          <button className="gbtn" style={{ padding:"3px 7px", fontSize:10 }} onClick={()=>{setBform({...t});setBedit(t.id);setBview("add");}}>Edit</button>
                          <button style={{ background:"none", border:"1px solid #ff4d6d33", color:"#ff4d6d", padding:"3px 7px", borderRadius:4, cursor:"pointer", fontSize:10 }} onClick={()=>{if(window.confirm("Apagar?"))setBtt(p=>p.filter(x=>x.id!==t.id));}}>x</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {bview==="add" && (
              <div className="fi" style={{ maxWidth:560, margin:"0 auto", display:"flex", flexDirection:"column", gap:14 }}>
                <div style={{ fontSize:18, fontWeight:800, color:"#fff" }}>{bedit?"Editar":"+ Registrar Trade"}</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                  <div><div className="lbl">Tipo</div>
                    <select className="inp" value={bform.itype} onChange={e=>setBform(f=>({...f,itype:e.target.value,inst:INST[e.target.value].items[0],tf:INST[e.target.value].dTFs[0]}))}>
                      {Object.entries(INST).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div><div className="lbl">Instrumento</div>
                    <select className="inp" value={bform.inst} onChange={e=>setBform(f=>({...f,inst:e.target.value}))}>
                      {INST[bform.itype].items.map(i=><option key={i}>{i}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                  <div><div className="lbl">Timeframe</div>
                    <select className="inp" value={bform.tf} onChange={e=>setBform(f=>({...f,tf:e.target.value}))}>
                      {INST[bform.itype].tfs.map(t=><option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div><div className="lbl">Confianca IA (%)</div>
                    <input className="inp" type="number" min={0} max={100} value={bform.conf} onChange={e=>setBform(f=>({...f,conf:e.target.value}))} />
                  </div>
                </div>
                <div><div className="lbl">Sinal</div>
                  <div style={{ display:"flex", gap:8 }}>
                    {["COMPRA","VENDA"].map(s=>(
                      <button key={s} onClick={()=>setBform(f=>({...f,sinal:s}))}
                        style={{ flex:1, padding:10, borderRadius:5, border:"1px solid "+(bform.sinal===s?sigC(s):"#1e2d42"), background:bform.sinal===s?sigC(s)+"15":"none", color:bform.sinal===s?sigC(s):"#243650", cursor:"pointer", fontSize:11, transition:".2s" }}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                  <div><div className="lbl">Risk:Reward</div><input className="inp" type="number" step="0.1" placeholder="2.0" value={bform.rr} onChange={e=>setBform(f=>({...f,rr:e.target.value}))} /></div>
                  <div><div className="lbl">Data / Hora</div><input className="inp" type="datetime-local" value={bform.date} onChange={e=>setBform(f=>({...f,date:e.target.value}))} /></div>
                </div>
                <div><div className="lbl">Resultado</div>
                  <div style={{ display:"flex", gap:8 }}>
                    {[{v:"",l:"ABERTO",c:"#f5c518"},{v:"WIN",l:"WIN",c:"#00e5a0"},{v:"LOSS",l:"LOSS",c:"#ff4d6d"},{v:"BREAKEVEN",l:"BE",c:"#f5c518"}].map(({v,l,c})=>(
                      <button key={l} onClick={()=>setBform(f=>({...f,result:v}))}
                        style={{ flex:1, padding:"9px 4px", borderRadius:4, border:"1px solid "+(bform.result===v?c:"#1e2d42"), background:bform.result===v?c+"15":"none", color:bform.result===v?c:"#243650", cursor:"pointer", fontSize:10, transition:".2s" }}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
                <div><div className="lbl">Anotacao</div>
                  <textarea className="inp" rows={3} placeholder="O que aprendeu com este trade?" value={bform.nota} onChange={e=>setBform(f=>({...f,nota:e.target.value}))} />
                </div>
                <div style={{ display:"flex", gap:10 }}>
                  <button onClick={bsave} style={{ flex:1, background:"#00e5a0", color:"#05080e", border:"none", padding:"11px 18px", fontFamily:"JetBrains Mono,monospace", fontSize:11, fontWeight:500, letterSpacing:2, cursor:"pointer", borderRadius:5 }}>{bedit?"Salvar":"+ Registrar"}</button>
                  <button className="gbtn" onClick={()=>{setBview("log");setBedit(null);}}>Cancelar</button>
                </div>
              </div>
            )}
          </div>
        )}

      </div>

      <div style={{ textAlign:"center", padding:"18px", fontSize:9, color:"#1e2d42", letterSpacing:1, borderTop:"1px solid #101a28", marginTop:20 }}>
        TRADEIQ - FOREX + INDICES SINTETICOS - ANALISE POR IA - NAO CONSTITUI RECOMENDACAO FINANCEIRA
      </div>
    </div>
  );
}
