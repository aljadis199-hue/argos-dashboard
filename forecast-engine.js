// ARGOS Forecast Engine v2.0
// Specialist adaptive forecasting module
// Models: Holt-Winters · Holt Linear · Seasonal Naive · AR(1) · LinReg · SES
// Strategy: walk-forward MAPE backtest → adaptive inverse-error weights

(function(global) {
  'use strict';

  function mean(a) { return a.length ? a.reduce((s,v)=>s+v,0)/a.length : 0; }
  function clamp0(v) { return Math.max(0, isFinite(v) ? v : 0); }
  function stdDev(a) {
    if (a.length < 2) return 0;
    const m = mean(a);
    return Math.sqrt(a.reduce((s,v)=>s+(v-m)**2,0)/a.length);
  }

  // ── LINEAR REGRESSION ──────────────────────────────────────────────
  function linReg(y) {
    const n = y.length;
    if (n < 2) return { slope:0, intercept:y[0]||0, predict: ()=>clamp0(y[0]||0) };
    const mx=(n-1)/2, my=mean(y);
    const num=y.reduce((s,v,i)=>s+(i-mx)*(v-my),0);
    const den=y.reduce((s,_,i)=>s+(i-mx)**2,0);
    const slope=den?num/den:0, intercept=my-slope*mx;
    return { slope, intercept, predict: i=>clamp0(slope*i+intercept) };
  }

  // ── SIMPLE EXPONENTIAL SMOOTHING ───────────────────────────────────
  function ses(data, alpha=0.25) {
    let l=data[0]||0;
    const fitted=[l];
    for (let i=1;i<data.length;i++) { l=alpha*data[i]+(1-alpha)*l; fitted.push(l); }
    return { fitted, forecast:()=>clamp0(l) };
  }

  // ── HOLT LINEAR (DOUBLE EXP SMOOTHING) ─────────────────────────────
  function holtLinear(data, alpha=0.35, beta=0.12) {
    if (data.length<2) return { fitted:data.slice(), level:data[0]||0, slope:0, forecast:()=>clamp0(data[0]||0) };
    let l=data[0], b=data[1]-data[0];
    const fitted=[];
    for (const v of data) {
      const lp=l, bp=b;
      l=alpha*v+(1-alpha)*(lp+bp);
      b=beta*(l-lp)+(1-beta)*bp;
      fitted.push(lp+bp);
    }
    return { fitted, level:l, slope:b, forecast:h=>clamp0(l+b*h) };
  }

  // ── HOLT-WINTERS (TRIPLE EXP SMOOTHING) ────────────────────────────
  function holtWinters(data, alpha=0.35, beta=0.10, gamma=0.25, period=12) {
    const n=data.length;
    if (n<period*2) return null;
    const s=[];
    let a1=0, a2=0;
    for(let j=0;j<period;j++) a1+=data[j]/period;
    for(let j=period;j<period*2;j++) a2+=data[j]/period;
    for(let i=0;i<period;i++) s[i]=((data[i]/(a1||1))+(data[i+period]/(a2||1)))/2;
    let l=a1, b=0;
    for(let i=0;i<period;i++) b+=(data[i+period]-data[i])/(period*period);
    const fitted=[];
    for(let i=0;i<n;i++) {
      const m=i%period, pl=l, pb=b, ps=s[m];
      l=alpha*(data[i]/(ps||1))+(1-alpha)*(pl+pb);
      b=beta*(l-pl)+(1-beta)*pb;
      s[m]=gamma*(data[i]/(l||1))+(1-gamma)*ps;
      fitted.push((pl+pb)*(ps||1));
    }
    return { fitted, forecast:h=>clamp0((l+b*h)*(s[(n-1+h)%period]||1)) };
  }

  // ── SEASONAL NAIVE ─────────────────────────────────────────────────
  // "Same month last year + linear trend" — highly effective for seasonal patterns
  function seasonalNaive(data, period=12) {
    const n=data.length;
    if (n<period+1) return null;
    const reg=linReg(data);
    const fitted=data.map((v,i)=>{
      if (i<period) return reg.predict(i);
      return clamp0(data[i-period]+reg.slope*period);
    });
    return {
      fitted,
      forecast: h => {
        const idx = n - period + ((h-1)%period);
        const base = (idx>=0&&idx<n) ? data[idx] : data[n-1];
        return clamp0(base + reg.slope*period*Math.ceil(h/period));
      }
    };
  }

  // ── AR(1) WITH LINEAR TREND ────────────────────────────────────────
  // Autoregressive: captures momentum / mean-reversion
  function ar1(data) {
    const n=data.length;
    if (n<5) return null;
    let s1=0,s2=0,s3=0,s11=0,s12=0,s13=0,s22=0,s23=0,s33=0,r1=0,r2=0,r3=0;
    for(let i=1;i<n;i++){
      const x1=1, x2=data[i-1], x3=i, y=data[i];
      s1+=x1;s2+=x2;s3+=x3;
      s11+=x1*x1;s12+=x1*x2;s13+=x1*x3;
      s22+=x2*x2;s23+=x2*x3;s33+=x3*x3;
      r1+=x1*y;r2+=x2*y;r3+=x3*y;
    }
    const c=solve3([[s11,s12,s13],[s12,s22,s23],[s13,s23,s33]],[r1,r2,r3]);
    if (!c) return null;
    const [k, phi, beta]=c;
    const fitted=[data[0]];
    for(let i=1;i<n;i++) fitted.push(clamp0(k+phi*data[i-1]+beta*i));
    return {
      fitted,
      forecast: h=>{
        let last=data[n-1];
        for(let i=0;i<h;i++) last=clamp0(k+phi*last+beta*(n+i));
        return last;
      }
    };
  }

  function solve3(A,b){
    const M=A.map((r,i)=>[...r,b[i]]);
    for(let c=0;c<3;c++){
      let p=-1;
      for(let r=c;r<3;r++) if(Math.abs(M[r][c])>1e-10){p=r;break;}
      if(p<0) return null;
      [M[c],M[p]]=[M[p],M[c]];
      const d=M[c][c];
      for(let k=c;k<=3;k++) M[c][k]/=d;
      for(let r=0;r<3;r++) if(r!==c){const f=M[r][c];for(let k=c;k<=3;k++) M[r][k]-=f*M[c][k];}
    }
    return [M[0][3],M[1][3],M[2][3]];
  }

  // ── RANDOM FOREST (TIME-SERIES ADAPTATION) ─────────────────────────
  // Univariate RF via lag features (1, 2, 3, 12) + month-of-year + rolling means (3, 6)
  // 50 trees · max depth 4 · feature subsampling sqrt(p) · bootstrap aggregation
  // Conservative to avoid overfitting on short monthly series (12–24 points typical)
  function tsFeatures(data, idx) {
    const lag1  = idx>=1  ? data[idx-1]  : 0;
    const lag2  = idx>=2  ? data[idx-2]  : 0;
    const lag3  = idx>=3  ? data[idx-3]  : 0;
    const lag12 = idx>=12 ? data[idx-12] : 0;
    const moy   = idx % 12;
    const r3 = idx>=3 ? mean(data.slice(idx-3, idx)) : (idx>0?mean(data.slice(0,idx)):0);
    const r6 = idx>=6 ? mean(data.slice(idx-6, idx)) : (idx>0?mean(data.slice(0,idx)):0);
    return [lag1, lag2, lag3, lag12, moy, r3, r6];
  }
  function variance(arr) {
    if (arr.length<2) return 0;
    const m=mean(arr);
    return arr.reduce((s,v)=>s+(v-m)**2,0)/arr.length;
  }
  function bestSplit(samples) {
    if (samples.length<4) return null;
    const ys=samples.map(s=>s.y);
    const baseVar=variance(ys);
    const nFeat=samples[0].x.length;
    // Feature subsampling (sqrt(p)) — clásico de Random Forest
    const featPool=[];
    const need=Math.max(2, Math.floor(Math.sqrt(nFeat)));
    while (featPool.length<need) {
      const f=Math.floor(Math.random()*nFeat);
      if (!featPool.includes(f)) featPool.push(f);
    }
    let best=null;
    featPool.forEach(f => {
      const vals=[...new Set(samples.map(s=>s.x[f]))].sort((a,b)=>a-b);
      for (let i=0;i<vals.length-1;i++) {
        const t=(vals[i]+vals[i+1])/2;
        const L=samples.filter(s=>s.x[f]<=t).map(s=>s.y);
        const R=samples.filter(s=>s.x[f]>t).map(s=>s.y);
        if (L.length<2||R.length<2) continue;
        const wVar=(L.length*variance(L)+R.length*variance(R))/samples.length;
        const gain=baseVar-wVar;
        if (!best||gain>best.gain) best={feature:f,threshold:t,gain};
      }
    });
    return best;
  }
  function buildTree(samples, depth, maxDepth) {
    if (samples.length<4||depth>=maxDepth)
      return {leaf:true, value:mean(samples.map(s=>s.y))};
    const split=bestSplit(samples);
    if (!split||split.gain<1e-6)
      return {leaf:true, value:mean(samples.map(s=>s.y))};
    const L=samples.filter(s=>s.x[split.feature]<=split.threshold);
    const R=samples.filter(s=>s.x[split.feature]>split.threshold);
    return {
      leaf:false, feature:split.feature, threshold:split.threshold,
      left:buildTree(L,depth+1,maxDepth), right:buildTree(R,depth+1,maxDepth)
    };
  }
  function predictTree(tree, x) {
    if (tree.leaf) return tree.value;
    return predictTree(x[tree.feature]<=tree.threshold?tree.left:tree.right, x);
  }
  function randomForest(data, nTrees=50, maxDepth=4) {
    if (data.length<6) return null;
    const samples=[];
    for (let i=3;i<data.length;i++) samples.push({x:tsFeatures(data,i), y:data[i]});
    if (samples.length<4) return null;
    const n=samples.length;
    const trees=[];
    for (let t=0;t<nTrees;t++) {
      const boot=[];
      for (let i=0;i<n;i++) boot.push(samples[Math.floor(Math.random()*n)]);
      trees.push(buildTree(boot,0,maxDepth));
    }
    const predict=x => {
      let s=0;
      trees.forEach(tr => s+=predictTree(tr,x));
      return clamp0(s/trees.length);
    };
    const fitted=[];
    for (let i=0;i<data.length;i++) {
      fitted.push(i<3 ? data[i] : predict(tsFeatures(data,i)));
    }
    return {
      fitted,
      forecast: h => {
        const ext=[...data];
        for (let i=0;i<h;i++) ext.push(predict(tsFeatures(ext, ext.length)));
        return ext[ext.length-1];
      }
    };
  }

  // ── WALK-FORWARD BACKTEST ──────────────────────────────────────────
  // Returns MAPE per model over the last testN out-of-sample periods
  function backtest(vals, testN) {
    const n=vals.length, trainStart=n-testN;
    if(trainStart<3) return {};
    const errs={lr:[],ses:[],hl:[],hw:[],sn:[],ar:[],rf:[]};
    for(let t=trainStart;t<n;t++){
      const tr=vals.slice(0,t), actual=vals[t];
      const e=f=>Math.abs((actual-clamp0(f))/Math.max(1,actual));
      errs.lr.push(e(linReg(tr).predict(t)));
      errs.ses.push(e(ses(tr,0.25).forecast()));
      errs.hl.push(e(holtLinear(tr,0.35,0.12).forecast(1)));
      if(tr.length>=24){const hw=holtWinters(tr);if(hw)errs.hw.push(e(hw.forecast(1)));}
      if(tr.length>=13){const sn=seasonalNaive(tr);if(sn)errs.sn.push(e(sn.forecast(1)));}
      if(tr.length>=5){const ar=ar1(tr);if(ar)errs.ar.push(e(ar.forecast(1)));}
      if(tr.length>=6){const rf=randomForest(tr,30,4);if(rf)errs.rf.push(e(rf.forecast(1)));}
    }
    const out={};
    for(const m in errs) if(errs[m].length>0) out[m]=mean(errs[m]);
    return out;
  }

  // ── ADAPTIVE ENSEMBLE FORECAST ─────────────────────────────────────
  // Public API: same signature as old ensembleForecast()
  function forecast(monthlySales, monthsAhead=1) {
    if(!monthlySales||monthlySales.length<3) return null;
    const vals=monthlySales.map(r=>r.total);
    const n=vals.length;
    const lastKey=monthlySales[n-1].month;
    const [lY,lM]=lastKey.split('-').map(Number);
    const hasEnoughData=n>=7;

    // Build all applicable models
    const M={};
    M.lr  = linReg(vals);
    M.ses = ses(vals,0.25);
    M.hl  = holtLinear(vals,0.35,0.12);
    if(n>=24) M.hw = holtWinters(vals,0.35,0.10,0.25,12);
    if(n>=13) M.sn = seasonalNaive(vals,12);
    if(n>=5)  M.ar = ar1(vals);
    if(n>=6)  M.rf = randomForest(vals,50,4);

    // Walk-forward MAPE to rank models
    const testN=Math.min(6, Math.floor(n/3));
    const mapes=n>=6 ? backtest(vals,testN) : {};

    // Adaptive weights ∝ 1/(MAPE + ε)
    const avail=Object.keys(M).filter(k=>M[k]);
    const hasMape=avail.filter(k=>mapes[k]!==undefined);
    const weights={};
    if(hasMape.length>0){
      const raw={};
      hasMape.forEach(k=>raw[k]=1/(mapes[k]+0.02));
      const tot=Object.values(raw).reduce((a,b)=>a+b,0);
      hasMape.forEach(k=>weights[k]=raw[k]/tot);
      // Give a small weight to models without MAPE data
      const noMape=avail.filter(k=>!mapes[k]);
      const extra=0.05/Math.max(1,noMape.length);
      noMape.forEach(k=>weights[k]=extra);
      const tot2=Object.values(weights).reduce((a,b)=>a+b,0);
      for(const k in weights) weights[k]/=tot2;
    } else {
      avail.forEach(k=>weights[k]=1/avail.length);
    }

    // Volatility for confidence intervals
    const recent=vals.slice(-Math.min(6,n));
    const sigma=stdDev(recent)||mean(recent)*0.15;

    // Generate ensemble forecast for each future month
    const ensemble=[];
    for(let h=1;h<=monthsAhead;h++){
      const rawM=lM+h, nm=((rawM-1)%12)+1, ny=lY+Math.floor((rawM-1)/12);
      let point=0;
      const pred={
        lr:  ()=>M.lr.predict(n-1+h),
        ses: ()=>M.ses.forecast(),
        hl:  ()=>M.hl.forecast(h),
        hw:  ()=>M.hw?.forecast(h)||0,
        sn:  ()=>M.sn?.forecast(h)||0,
        ar:  ()=>M.ar?.forecast(h)||0,
        rf:  ()=>M.rf?.forecast(h)||0
      };
      for(const k in weights) point+=weights[k]*(pred[k]?.()??0);
      point=clamp0(point);
      const unc=sigma*(1+h*0.2);
      ensemble.push({
        point, low:clamp0(point-1.5*unc), high:point+1.5*unc,
        month:`${ny}-${String(nm).padStart(2,'0')}`
      });
    }

    // Model name for display
    const bestKey=hasMape.length?hasMape.reduce((b,k)=>mapes[k]<mapes[b]?k:b,'hl'):'hl';
    const modelName = M.rf&&(weights.rf||0)>0.25 ? 'Random Forest Ensemble'
                    : M.hw&&(weights.hw||0)>0.25 ? 'Holt-Winters Ensemble'
                    : M.sn&&(weights.sn||0)>0.20 ? 'Seasonal Naive Ensemble'
                    : M.ar&&(weights.ar||0)>0.20 ? 'AR(1) Ensemble'
                    : hasEnoughData                ? 'Adaptive Ensemble'
                    :                               'Exponential Smoothing';
    const overallMape=mapes[bestKey]??null;

    // In-sample fitted values del ensemble (uno por mes histórico)
    // — usado para reconstruir las "Projection" históricas en la tabla
    const fitted=[];
    for(let i=0;i<n;i++){
      let sum=0, wTot=0;
      for(const k in weights){
        const f = M[k] && M[k].fitted && M[k].fitted[i];
        if (f!=null && isFinite(f)) { sum += weights[k]*f; wTot += weights[k]; }
      }
      fitted.push(clamp0(wTot>0 ? sum/wTot : vals[i]));
    }

    return { ensemble, fitted, mape:overallMape, model:modelName, hasEnoughData, weights, modelMapes:mapes };
  }

  // ── DAILY FORECAST ────────────────────────────────────────────────
  // Day-of-week seasonality (last 90 days) + Holt Linear 30-day trend
  function dailyForecast(dailySales, daysAhead=14) {
    if(!dailySales||dailySales.length<14) return [];
    const todayStr = new Date().toISOString().split('T')[0];
    // Ignorar fechas futuras (datos con fecha > hoy son errores de captura — no tiene sentido proyectar desde el futuro)
    const sorted=[...dailySales].filter(r=>r.date&&r.total>=0 && r.date<=todayStr).sort((a,b)=>a.date.localeCompare(b.date));
    if(sorted.length<14) return [];

    // DOW seasonality indices from last 90 days
    const r90=sorted.slice(-90);
    const dS={},dC={};
    r90.forEach(r=>{ const d=new Date(r.date+'T12:00:00').getDay(); dS[d]=(dS[d]||0)+r.total; dC[d]=(dC[d]||0)+1; });
    const oAvg=mean(r90.map(r=>r.total))||1;
    const dowIdx={};
    for(let d=0;d<7;d++) dowIdx[d]=dC[d]?(dS[d]/dC[d])/oAvg:1;

    // 30-day Holt Linear trend
    const r30=sorted.slice(-30);
    const vals30=r30.map(r=>r.total);
    const hl30=holtLinear(vals30,0.30,0.10);
    const sigma30=stdDev(vals30)||oAvg*0.2;

    const lastDate=new Date(sorted[sorted.length-1].date+'T12:00:00');
    return Array.from({length:daysAhead},(_,i)=>{
      const d=new Date(lastDate); d.setDate(d.getDate()+i+1);
      const ds=d.toISOString().split('T')[0];
      const dow=d.getDay();
      const base=hl30.forecast(i+1);
      const point=clamp0(base*(dowIdx[dow]||1));
      return { date:ds, value:point, low:clamp0(point-sigma30), high:point+sigma30, isProjection:true };
    });
  }

  // ── PUBLIC API ────────────────────────────────────────────────────
  global.ArgosForecaster = { forecast, dailyForecast };

})(window);

