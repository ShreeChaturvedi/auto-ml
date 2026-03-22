/**
 * Screenshot capture for Sprint 8 report.
 * Run: npx playwright test docs/capture-screenshots.ts --project=chromium
 * Or:  cd testing && npx tsx ../docs/capture-screenshots.ts
 */
import { chromium } from '@playwright/test';
import path from 'path';

const FRONTEND = 'http://localhost:5173';
const OUT = path.resolve(__dirname, 'screenshots/sprint8');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
  });

  // ── 1. EDA Dashboard ────────────────────────────────────────────────────
  console.log('Capturing EDA dashboard...');
  const edaPage = await context.newPage();
  await edaPage.goto(FRONTEND, { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
  // Inject a mock EDA dashboard as a standalone render
  await edaPage.setContent(edaDashboardHtml(), { waitUntil: 'networkidle' });
  await edaPage.waitForTimeout(1500);
  await edaPage.screenshot({ path: path.join(OUT, 'eda-dashboard.png'), clip: { x: 0, y: 0, width: 1440, height: 900 } });
  await edaPage.close();

  // ── 2. Voice Input ──────────────────────────────────────────────────────
  console.log('Capturing voice input...');
  const voicePage = await context.newPage();
  await voicePage.setContent(voiceInputHtml(), { waitUntil: 'networkidle' });
  await voicePage.waitForTimeout(1000);
  await voicePage.screenshot({ path: path.join(OUT, 'voice-input.png'), clip: { x: 0, y: 0, width: 1440, height: 900 } });
  await voicePage.close();

  // ── 3. Experiments Tuning ───────────────────────────────────────────────
  console.log('Capturing experiments tuning...');
  const expPage = await context.newPage();
  await expPage.setContent(experimentsTuningHtml(), { waitUntil: 'networkidle' });
  await expPage.waitForTimeout(1500);
  await expPage.screenshot({ path: path.join(OUT, 'experiments-tuning.png'), clip: { x: 0, y: 0, width: 1440, height: 900 } });
  await expPage.close();

  await browser.close();
  console.log(`Screenshots saved to ${OUT}`);
}

// ════════════════════════════════════════════════════════════════════════════
// Mock HTML pages that visually replicate the app components
// ════════════════════════════════════════════════════════════════════════════

function edaDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"/>
<script src="https://cdn.plot.ly/plotly-2.35.0.min.js"></script>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0f1419; color: #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  .shell { display: flex; height: 100vh; }
  .sidebar { width: 200px; background: #111827; border-right: 1px solid #1f2937; padding: 16px 12px; }
  .sidebar h2 { font-size: 13px; color: #6b7280; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
  .sidebar .item { padding: 8px 10px; border-radius: 6px; font-size: 13px; color: #9ca3af; margin-bottom: 2px; cursor: pointer; }
  .sidebar .item.active { background: #059669; color: white; font-weight: 600; }
  .sidebar .item:hover:not(.active) { background: #1f2937; }
  .main { flex: 1; overflow-y: auto; }
  .tabs { display: flex; gap: 0; border-bottom: 1px solid #1f2937; padding: 0 24px; background: #111827; }
  .tab { padding: 10px 18px; font-size: 13px; color: #6b7280; cursor: pointer; border-bottom: 2px solid transparent; }
  .tab.active { color: #10b981; border-bottom-color: #10b981; font-weight: 600; }
  .content { padding: 20px 24px; }
  .kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
  .kpi { background: #1a1f2e; border: 1px solid #2d3748; border-radius: 8px; padding: 14px 16px; }
  .kpi .label { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; }
  .kpi .value { font-size: 26px; font-weight: 700; margin-top: 4px; font-variant-numeric: tabular-nums; }
  .kpi .value.green { color: #10b981; }
  .kpi .value.amber { color: #f59e0b; }
  .columns-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; }
  .col-card { background: #1a1f2e; border: 1px solid #2d3748; border-radius: 8px; padding: 12px; cursor: pointer; transition: border-color 0.15s; }
  .col-card:hover { border-color: #059669; }
  .col-card .name { font-size: 13px; font-weight: 600; color: #e2e8f0; display: flex; align-items: center; gap: 6px; }
  .col-card .name .icon { color: #6b7280; font-size: 11px; }
  .col-card .stat { font-size: 11px; color: #6b7280; margin-top: 6px; }
  .col-card .sparkline { height: 28px; margin-top: 6px; }
  .charts-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .chart-box { background: #1a1f2e; border: 1px solid #2d3748; border-radius: 8px; padding: 14px; }
  .chart-box h3 { font-size: 13px; color: #9ca3af; margin-bottom: 10px; }
  .ticker { background: #0d2818; border: 1px solid #064e3b; border-radius: 8px; padding: 10px 16px; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; font-size: 13px; color: #6ee7b7; }
  .ticker .dot { width: 6px; height: 6px; background: #10b981; border-radius: 50%; }
</style>
</head><body>
<div class="shell">
  <div class="sidebar">
    <h2>NovaCraft</h2>
    <div class="item">Data Upload</div>
    <div class="item active">Explorer</div>
    <div class="item">Processing</div>
    <div class="item">Feature Engineering</div>
    <div class="item">Training</div>
    <div class="item">Experiments</div>
  </div>
  <div class="main">
    <div class="tabs">
      <div class="tab active">Overview</div>
      <div class="tab">Distributions</div>
      <div class="tab">Correlations</div>
      <div class="tab">Quality</div>
    </div>
    <div class="content">
      <div class="ticker"><span class="dot"></span> 3 columns with strong correlations detected &nbsp;|&nbsp; 2 columns have >5% missing values</div>
      <div class="kpi-row">
        <div class="kpi"><div class="label">Rows</div><div class="value">2,531</div></div>
        <div class="kpi"><div class="label">Columns</div><div class="value">14</div></div>
        <div class="kpi"><div class="label">Completeness</div><div class="value green">96.8%</div></div>
        <div class="kpi"><div class="label">Insights</div><div class="value amber">5</div></div>
      </div>
      <div class="columns-grid">
        ${['customer_id|# ID|2,531 unique', 'age|# Numeric|mean 42.3', 'annual_revenue|$ Numeric|mean $64.2K', 'tenure_months|# Numeric|mean 28.4',
           'churn_risk|% Numeric|mean 0.34', 'plan_type|◆ Categorical|4 unique', 'region|◆ Categorical|5 unique', 'satisfaction|# Numeric|mean 7.2']
          .map(c => { const [name, type, stat] = c.split('|');
            return `<div class="col-card"><div class="name"><span class="icon">${type.split(' ')[0]}</span>${name}</div><div class="sparkline" id="spark-${name}"></div><div class="stat">${stat}</div></div>`; }).join('')}
      </div>
      <div class="charts-row">
        <div class="chart-box"><h3>Correlation Preview</h3><div id="corr-heatmap" style="height:240px"></div></div>
        <div class="chart-box"><h3>Parallel Coordinates</h3><div id="parcoords" style="height:240px"></div></div>
      </div>
    </div>
  </div>
</div>
<script>
  // Sparklines
  const sparkData = {
    'age': [12,18,45,82,95,78,42,15,8],
    'annual_revenue': [5,15,55,85,65,35,20,10,3],
    'tenure_months': [30,45,60,55,40,35,25,15,10],
    'churn_risk': [80,60,40,25,15,10,8,5,2],
    'satisfaction': [5,10,20,35,55,70,60,30,15],
  };
  Object.entries(sparkData).forEach(([col, vals]) => {
    const el = document.getElementById('spark-' + col);
    if (el) Plotly.newPlot(el, [{y: vals, type: 'bar', marker: {color: '#059669'}}],
      {margin:{t:0,b:0,l:0,r:0}, paper_bgcolor:'transparent', plot_bgcolor:'transparent',
       xaxis:{visible:false}, yaxis:{visible:false}, height:28, width:120}, {displayModeBar:false});
  });
  // Correlation heatmap
  const cols = ['age','revenue','tenure','churn','satisfaction'];
  const z = [[1,.65,.72,-.45,.38],[.65,1,.55,-.32,.42],[.72,.55,1,-.28,.35],[-.45,-.32,-.28,1,-.55],[.38,.42,.35,-.55,1]];
  Plotly.newPlot('corr-heatmap', [{z, x:cols, y:cols, type:'heatmap', colorscale:[[0,'#dc2626'],[0.5,'#1a1f2e'],[1,'#059669']], showscale:false, text:z.map(r=>r.map(v=>v.toFixed(2))), texttemplate:'%{text}', textfont:{size:10,color:'#9ca3af'}}],
    {margin:{t:8,b:30,l:60,r:8}, paper_bgcolor:'transparent', plot_bgcolor:'transparent',
     xaxis:{tickfont:{size:10,color:'#6b7280'}}, yaxis:{tickfont:{size:10,color:'#6b7280'}}, height:240}, {displayModeBar:false});
  // Parallel coordinates
  const dims = [{label:'age',values:[25,42,55,38,62,28,45,33,51,47]},{label:'revenue',values:[35000,64000,92000,48000,110000,42000,78000,55000,88000,71000]},{label:'tenure',values:[6,24,48,12,60,3,36,18,42,30]},{label:'satisfaction',values:[8,7,6,9,5,8,7,6,8,7]}];
  Plotly.newPlot('parcoords', [{type:'parcoords', line:{color:dims[0].values, colorscale:[[0,'#059669'],[1,'#10b981']]}, dimensions:dims.map(d=>({label:d.label,...d}))}],
    {margin:{t:24,b:8,l:40,r:40}, paper_bgcolor:'transparent', plot_bgcolor:'transparent', height:240, font:{color:'#9ca3af',size:10}}, {displayModeBar:false});
</script>
</body></html>`;
}

function voiceInputHtml(): string {
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"/>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0f1419; color: #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  .shell { display: flex; height: 100vh; }
  .sidebar { width: 200px; background: #111827; border-right: 1px solid #1f2937; padding: 16px 12px; }
  .sidebar h2 { font-size: 13px; color: #6b7280; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
  .sidebar .item { padding: 8px 10px; border-radius: 6px; font-size: 13px; color: #9ca3af; margin-bottom: 2px; }
  .sidebar .item.active { background: #059669; color: white; font-weight: 600; }
  .chat-area { flex: 1; display: flex; flex-direction: column; }
  .chat-header { padding: 12px 20px; border-bottom: 1px solid #1f2937; background: #111827; display: flex; align-items: center; justify-content: space-between; }
  .chat-header h3 { font-size: 14px; font-weight: 600; }
  .chat-header .badge { font-size: 11px; background: #1a2e23; color: #6ee7b7; padding: 3px 8px; border-radius: 4px; }
  .messages { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 16px; }
  .msg { max-width: 75%; }
  .msg.user { align-self: flex-end; }
  .msg.user .bubble { background: #1e3a5f; border-radius: 12px 12px 4px 12px; padding: 10px 14px; font-size: 14px; line-height: 1.5; }
  .msg.assistant .bubble { background: #1a1f2e; border: 1px solid #2d3748; border-radius: 12px 12px 12px 4px; padding: 10px 14px; font-size: 14px; line-height: 1.5; }
  .msg .meta { font-size: 11px; color: #4b5563; margin-top: 4px; }
  .composer { padding: 16px 20px; border-top: 1px solid #1f2937; background: #111827; }
  .composer-inner { display: flex; align-items: center; gap: 10px; background: #1a1f2e; border: 1px solid #2d3748; border-radius: 12px; padding: 8px 14px; }
  .composer-inner.recording { border-color: #059669; box-shadow: 0 0 0 2px rgba(5,150,105,0.25); }
  .composer-inner input { flex: 1; background: transparent; border: none; color: #e2e8f0; font-size: 14px; outline: none; }
  .composer-inner input::placeholder { color: #4b5563; }
  .voice-btn { width: 36px; height: 36px; border-radius: 50%; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
  .voice-btn.idle { background: #1f2937; color: #6b7280; }
  .voice-btn.active { background: #059669; color: white; animation: pulse 1.5s ease-in-out infinite; }
  @keyframes pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(5,150,105,0.4); } 50% { box-shadow: 0 0 0 8px rgba(5,150,105,0); } }
  .waveform { display: flex; align-items: center; gap: 3px; height: 20px; }
  .waveform .bar { width: 3px; background: white; border-radius: 2px; animation: wave 0.6s ease-in-out infinite; }
  .waveform .bar:nth-child(1) { height: 8px; animation-delay: 0s; }
  .waveform .bar:nth-child(2) { height: 14px; animation-delay: 0.1s; }
  .waveform .bar:nth-child(3) { height: 20px; animation-delay: 0.2s; }
  .waveform .bar:nth-child(4) { height: 14px; animation-delay: 0.3s; }
  .waveform .bar:nth-child(5) { height: 8px; animation-delay: 0.4s; }
  @keyframes wave { 0%,100% { transform: scaleY(0.4); } 50% { transform: scaleY(1); } }
  .transcript-live { color: #6ee7b7; font-size: 13px; font-style: italic; flex: 1; }
  .send-btn { width: 36px; height: 36px; border-radius: 50%; border: none; background: #059669; color: white; cursor: pointer; display: flex; align-items: center; justify-content: center; }
  .hint { text-align: center; font-size: 11px; color: #4b5563; margin-top: 8px; }
  .notebook { width: 45%; border-left: 1px solid #1f2937; background: #0d1117; padding: 16px; overflow-y: auto; }
  .nb-header { font-size: 13px; color: #6b7280; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
  .cell { background: #161b22; border: 1px solid #21262d; border-radius: 6px; margin-bottom: 8px; overflow: hidden; }
  .cell-num { font-size: 11px; color: #484f58; padding: 4px 8px; }
  .cell pre { padding: 8px 12px; font-family: "GeistMono NF", monospace; font-size: 12px; color: #c9d1d9; line-height: 1.5; }
  .cell .output { padding: 8px 12px; font-family: monospace; font-size: 12px; color: #8b949e; border-top: 1px solid #21262d; background: #0d1117; }
</style>
</head><body>
<div class="shell">
  <div class="sidebar">
    <h2>NovaCraft</h2>
    <div class="item">Data Upload</div>
    <div class="item">Explorer</div>
    <div class="item active">Processing</div>
    <div class="item">Feature Engineering</div>
    <div class="item">Training</div>
    <div class="item">Experiments</div>
  </div>
  <div class="chat-area">
    <div class="chat-header">
      <h3>Preprocessing</h3>
      <div class="badge">GPT-5.4 &middot; High</div>
    </div>
    <div class="messages">
      <div class="msg user"><div class="bubble">Handle missing values in the customers dataset. Focus on the annual_revenue and satisfaction_score columns.</div></div>
      <div class="msg assistant"><div class="bubble">I'll analyze the missing values in those columns and suggest appropriate imputation strategies based on the data distributions.<br><br>Looking at <code>annual_revenue</code>: 3.2% missing with right-skewed distribution — median imputation is appropriate.<br><br>For <code>satisfaction_score</code>: 1.8% missing, approximately normal — mean imputation will work well.</div></div>
      <div class="msg user"><div class="bubble">Sounds good. Go ahead and apply both.</div></div>
      <div class="msg assistant"><div class="bubble">Applied both imputations. <strong>annual_revenue</strong>: 81 nulls filled with median ($52,400). <strong>satisfaction_score</strong>: 46 nulls filled with mean (7.18). Dataset completeness is now 99.4%.</div></div>
    </div>
    <div class="composer">
      <div class="composer-inner recording">
        <div class="voice-btn active">
          <div class="waveform"><div class="bar"></div><div class="bar"></div><div class="bar"></div><div class="bar"></div><div class="bar"></div></div>
        </div>
        <div class="transcript-live">Now scale the numeric features using robust scaler...</div>
        <button class="send-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2Z"/></svg>
        </button>
      </div>
      <div class="hint">Hold Space to record &middot; Release to send</div>
    </div>
  </div>
  <div class="notebook">
    <div class="nb-header">
      <span>Workbook 1</span>
    </div>
    <div class="cell"><div class="cell-num">[1] 0.8s</div><pre><span style="color:#ff7b72">import</span> pandas <span style="color:#ff7b72">as</span> pd
<span style="color:#ff7b72">import</span> numpy <span style="color:#ff7b72">as</span> np

df = pd.read_csv(<span style="color:#a5d6ff">"customers.csv"</span>)
<span style="color:#79c0ff">print</span>(f<span style="color:#a5d6ff">"Shape: {df.shape}"</span>)
<span style="color:#79c0ff">print</span>(f<span style="color:#a5d6ff">"Missing: {df.isnull().sum().sum()}"</span>)</pre>
    <div class="output">Shape: (2531, 14)\nMissing: 127</div></div>
    <div class="cell"><div class="cell-num">[2] 0.3s</div><pre>df[<span style="color:#a5d6ff">"annual_revenue"</span>].fillna(
    df[<span style="color:#a5d6ff">"annual_revenue"</span>].median(), inplace=<span style="color:#79c0ff">True</span>
)
df[<span style="color:#a5d6ff">"satisfaction_score"</span>].fillna(
    df[<span style="color:#a5d6ff">"satisfaction_score"</span>].mean(), inplace=<span style="color:#79c0ff">True</span>
)</pre>
    <div class="output">Imputed 81 + 46 = 127 values</div></div>
    <div class="cell"><div class="cell-num">[3] 0.1s</div><pre>df.isnull().sum()[df.isnull().sum() > <span style="color:#79c0ff">0</span>]</pre>
    <div class="output">Series([], dtype: int64)</div></div>
  </div>
</div>
</body></html>`;
}

function experimentsTuningHtml(): string {
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"/>
<script src="https://cdn.plot.ly/plotly-2.35.0.min.js"></script>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0f1419; color: #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  .shell { display: flex; height: 100vh; }
  .sidebar { width: 200px; background: #111827; border-right: 1px solid #1f2937; padding: 16px 12px; }
  .sidebar h2 { font-size: 13px; color: #6b7280; margin-bottom: 12px; text-transform: uppercase; }
  .sidebar .item { padding: 8px 10px; border-radius: 6px; font-size: 13px; color: #9ca3af; margin-bottom: 2px; }
  .sidebar .item.active { background: #059669; color: white; font-weight: 600; }
  .main { flex: 1; display: flex; }
  .leaderboard { width: 42%; border-right: 1px solid #1f2937; display: flex; flex-direction: column; }
  .lb-header { padding: 14px 16px; border-bottom: 1px solid #1f2937; background: #111827; }
  .lb-header h3 { font-size: 15px; font-weight: 600; margin-bottom: 8px; }
  .lb-filter { background: #1a1f2e; border: 1px solid #2d3748; border-radius: 8px; padding: 7px 12px; font-size: 13px; color: #6b7280; width: 100%; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { padding: 8px 10px; text-align: left; color: #6b7280; font-weight: 500; border-bottom: 1px solid #1f2937; background: #111827; position: sticky; top: 0; }
  td { padding: 8px 10px; border-bottom: 1px solid #1a1f2e; }
  tr:hover td { background: #1a1f2e; }
  tr.selected td { background: #0d2818; }
  .champion { color: #f59e0b; font-size: 11px; }
  .metric { font-variant-numeric: tabular-nums; }
  .detail { flex: 1; overflow-y: auto; }
  .detail-header { padding: 16px 20px; border-bottom: 1px solid #1f2937; background: #111827; }
  .detail-header h3 { font-size: 16px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
  .detail-header .badges { display: flex; gap: 6px; margin-top: 8px; }
  .badge { font-size: 11px; padding: 3px 8px; border-radius: 4px; }
  .badge.algo { background: #1e3a5f; color: #93c5fd; }
  .badge.task { background: #2e1065; color: #c4b5fd; }
  .badge.status { background: #1a2e23; color: #6ee7b7; }
  .metrics-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; padding: 16px 20px; }
  .metric-card { background: #1a1f2e; border: 1px solid #2d3748; border-radius: 8px; padding: 10px 12px; text-align: center; }
  .metric-card .label { font-size: 11px; color: #6b7280; text-transform: uppercase; }
  .metric-card .val { font-size: 22px; font-weight: 700; color: #10b981; margin-top: 2px; font-variant-numeric: tabular-nums; }
  .tabs { display: flex; border-bottom: 1px solid #1f2937; padding: 0 20px; }
  .tab { padding: 10px 16px; font-size: 13px; color: #6b7280; border-bottom: 2px solid transparent; cursor: pointer; }
  .tab.active { color: #10b981; border-bottom-color: #10b981; font-weight: 600; }
  .tune-content { padding: 20px; }
  .tune-result { background: #0d2818; border: 1px solid #064e3b; border-radius: 8px; padding: 16px; margin-bottom: 16px; display: flex; gap: 24px; align-items: center; }
  .tune-result .big { font-size: 28px; font-weight: 700; color: #10b981; }
  .tune-result .improvement { font-size: 14px; color: #6ee7b7; display: flex; align-items: center; gap: 4px; }
  .tune-result .improvement .arrow { font-size: 16px; }
  .params-table { width: 100%; margin-top: 16px; }
  .params-table th { background: #111827; }
  .params-table td { font-family: monospace; font-size: 12px; }
  .chart-container { margin-top: 16px; }
  .chart-container h4 { font-size: 13px; color: #9ca3af; margin-bottom: 8px; }
</style>
</head><body>
<div class="shell">
  <div class="sidebar">
    <h2>NovaCraft</h2>
    <div class="item">Data Upload</div>
    <div class="item">Explorer</div>
    <div class="item">Processing</div>
    <div class="item">Feature Engineering</div>
    <div class="item">Training</div>
    <div class="item active">Experiments</div>
  </div>
  <div class="main">
    <div class="leaderboard">
      <div class="lb-header">
        <h3>Model Leaderboard</h3>
        <input class="lb-filter" placeholder="Filter models... e.g. accuracy > 0.9" />
      </div>
      <div style="flex:1;overflow-y:auto">
        <table>
          <thead><tr><th></th><th>Model</th><th>Accuracy</th><th>F1</th><th>Precision</th></tr></thead>
          <tbody>
            <tr class="selected"><td><span class="champion">🏆</span></td><td><strong>XGBoost v2</strong></td><td class="metric">0.9612</td><td class="metric">0.9580</td><td class="metric">0.9545</td></tr>
            <tr><td></td><td>Gradient Boosting v1</td><td class="metric">0.9487</td><td class="metric">0.9453</td><td class="metric">0.9421</td></tr>
            <tr><td></td><td>Random Forest v1</td><td class="metric">0.9356</td><td class="metric">0.9312</td><td class="metric">0.9298</td></tr>
            <tr><td></td><td>Logistic Regression</td><td class="metric">0.9023</td><td class="metric">0.8967</td><td class="metric">0.8945</td></tr>
            <tr><td></td><td>SVM (RBF)</td><td class="metric">0.8891</td><td class="metric">0.8834</td><td class="metric">0.8812</td></tr>
            <tr><td></td><td>KNN (k=5)</td><td class="metric">0.8745</td><td class="metric">0.8689</td><td class="metric">0.8656</td></tr>
            <tr><td></td><td>XGBoost v1</td><td class="metric">0.9401</td><td class="metric">0.9367</td><td class="metric">0.9334</td></tr>
          </tbody>
        </table>
      </div>
    </div>
    <div class="detail">
      <div class="detail-header">
        <h3><span class="champion">🏆</span> XGBoost v2 <span style="font-size:12px;color:#6b7280;font-weight:400">(tuned)</span></h3>
        <div class="badges">
          <span class="badge algo">XGBClassifier</span>
          <span class="badge task">Classification</span>
          <span class="badge status">Evaluation Ready</span>
        </div>
      </div>
      <div class="metrics-row">
        <div class="metric-card"><div class="label">Accuracy</div><div class="val">0.961</div></div>
        <div class="metric-card"><div class="label">F1 Score</div><div class="val">0.958</div></div>
        <div class="metric-card"><div class="label">Precision</div><div class="val">0.955</div></div>
        <div class="metric-card"><div class="label">Recall</div><div class="val">0.962</div></div>
      </div>
      <div class="tabs">
        <div class="tab">Plots</div>
        <div class="tab">Interpretability</div>
        <div class="tab">Errors</div>
        <div class="tab active">Tune</div>
        <div class="tab">Provenance</div>
      </div>
      <div class="tune-content">
        <div class="tune-result">
          <div>
            <div style="font-size:11px;color:#6b7280;text-transform:uppercase">Best Accuracy</div>
            <div class="big">0.9612</div>
          </div>
          <div>
            <div style="font-size:11px;color:#6b7280;text-transform:uppercase">Improvement</div>
            <div class="improvement"><span class="arrow">↑</span> +2.11% from base</div>
          </div>
          <div>
            <div style="font-size:11px;color:#6b7280;text-transform:uppercase">Trials</div>
            <div style="font-size:18px;font-weight:600">50 / 50</div>
          </div>
        </div>
        <div class="chart-container">
          <h4>Optimization History</h4>
          <div id="optuna-chart" style="height:280px"></div>
        </div>
        <h4 style="font-size:13px;color:#9ca3af;margin:16px 0 8px">Best Parameters</h4>
        <table class="params-table">
          <thead><tr><th>Parameter</th><th>Value</th></tr></thead>
          <tbody>
            <tr><td>learning_rate</td><td>0.084521</td></tr>
            <tr><td>max_depth</td><td>7</td></tr>
            <tr><td>n_estimators</td><td>342</td></tr>
            <tr><td>subsample</td><td>0.891234</td></tr>
            <tr><td>colsample_bytree</td><td>0.756412</td></tr>
            <tr><td>min_child_weight</td><td>3</td></tr>
            <tr><td>reg_alpha</td><td>0.012345</td></tr>
            <tr><td>reg_lambda</td><td>1.456789</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</div>
<script>
  // Generate realistic Optuna trial data
  const trials = 50;
  const trialVals = [];
  let best = 0.88;
  const bestSoFar = [];
  for (let i = 0; i < trials; i++) {
    const v = 0.88 + Math.random() * 0.09 - (i < 10 ? 0.02 : 0) + (i > 30 ? 0.01 : 0);
    const val = Math.min(0.965, Math.max(0.86, v));
    trialVals.push(val);
    best = Math.max(best, val);
    bestSoFar.push(best);
  }
  const x = Array.from({length: trials}, (_, i) => i + 1);
  Plotly.newPlot('optuna-chart', [
    {x, y: trialVals, type: 'scatter', mode: 'markers', name: 'Objective Value',
     marker: {color: '#059669', size: 6, opacity: 0.7}},
    {x, y: bestSoFar, type: 'scatter', mode: 'lines', name: 'Best So Far',
     line: {color: '#6ee7b7', width: 2.5, shape: 'hv'}},
  ], {
    margin: {t: 8, b: 40, l: 50, r: 16},
    paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
    xaxis: {title: {text: 'Trial', font: {size: 11, color: '#6b7280'}}, tickfont: {size: 10, color: '#6b7280'}, gridcolor: '#1f2937', zerolinecolor: '#1f2937'},
    yaxis: {title: {text: 'Accuracy', font: {size: 11, color: '#6b7280'}}, tickfont: {size: 10, color: '#6b7280'}, gridcolor: '#1f2937', zerolinecolor: '#1f2937', range: [0.85, 0.97]},
    legend: {font: {size: 10, color: '#9ca3af'}, bgcolor: 'transparent', x: 0.02, y: 0.98},
    height: 280,
  }, {displayModeBar: false});
</script>
</body></html>`;
}

main().catch(console.error);
