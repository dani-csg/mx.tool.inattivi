// ==UserScript==
// @name         MX.Tool.Inattivi
// @namespace    mx.tool.inattivi
// @version      2.4.2
// @description  Tool inattivi per vendettagame.es (solo clasificacion / jugadores)
// @author       mx.
// @match        *://vendettagame.es/clasificacion*
// @match        *://*.vendettagame.es/clasificacion*
// @run-at       document-end
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @updateURL    https://github.com/dani-csg/mx.tool.inattivi/raw/refs/heads/main/MX.Tool.Inattivi.user.js
// @downloadURL  https://github.com/dani-csg/mx.tool.inattivi/raw/refs/heads/main/MX.Tool.Inattivi.user.js
// ==/UserScript==

(function () {
  'use strict';

  /* ==========================================================
     PAGE GUARD – NUR JUGADORES (/clasificacion)
     ✔ erlaubt ?page=, #hash
     ❌ blockiert /familias /economia /robo
  ========================================================== */
  function isRankingPage(){
    return location.pathname.replace(/\/+$/, '') === '/clasificacion';
  }

  if (!isRankingPage()) return;

  /* ---------- config / debug ---------- */
  const DEBUG = false;
  const log = (...a)=>{ if (DEBUG) console.log('[MX-Inattivi]', ...a); };

  /* ---------- utils ---------- */
  const $  = (s, r=document)=>r.querySelector(s);
  const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));

  const hostKey = location.host.replace(/^www\./,'');
  const K_ALL   = `mx_rank_snapshots__${hostKey}`;
  const K_BASE  = `mx_rank_baseline_id__${hostKey}`;
  const K_THR   = `mx_rank_total_threshold__${hostKey}`;
  const MAX_SNAPSHOTS = 50;

  const GM_Get=(k,d)=>{try{return GM_getValue(k,d);}catch{return d;}};
  const GM_Set=(k,v)=>{try{GM_setValue(k,v);}catch(e){ console.warn(e); }};
  const GM_Del=(k)=>{try{GM_deleteValue(k);}catch{}};

  const toInt = (t)=>{
    if (t==null) return 0;
    const s = String(t)
      .replace(/\[[^\]]*]/g,'')
      .replace(/\s+/g,'')
      .replace(/[^0-9,\.\-]/g,'');
    if (!s) return 0;
    return parseInt(s.replace(/[.,]/g,''),10) || 0;
  };

  const sign = n => n>0?`+${n}`:`${n}`;
  const fmt  = ts=>new Date(ts).toLocaleString();

  const loadAll = ()=>{ const a=GM_Get(K_ALL, []); return Array.isArray(a)?a:[]; };
  const saveAll = a=>GM_Set(K_ALL, a);
  const getBaselineId = ()=>GM_Get(K_BASE, null);
  const setBaselineId = id=>GM_Set(K_BASE, id);
  const getSnapshotById = id => id ? loadAll().find(s=>String(s.id)===String(id))||null : null;

  const getThreshold = ()=>Math.max(0, toInt(GM_Get(K_THR, 0)));
  const setThreshold = v=>GM_Set(K_THR, Math.max(0, toInt(v)));

  /* ==========================================================
     CSS
  ========================================================== */
  (function addCss(){
    if ($('#mx-rank-css')) return;
    const st = document.createElement('style');
    st.id = 'mx-rank-css';
    st.textContent = `
      #mx-rank-bar{
        position:sticky;top:0;z-index:2147483647;
        background:#111;color:#eee;padding:.35rem .6rem;
        border-bottom:1px solid #333;
        font:13px/1.2 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
      }
      #mx-rank-bar .mx-wrap{display:flex;gap:.5rem;align-items:center;flex-wrap:wrap}
      #mx-rank-bar button,#mx-rank-bar select,#mx-rank-bar input{
        padding:.28rem .55rem;border:1px solid #666;background:#1d1d1d;
        color:#eee;border-radius:6px;font-size:12px;cursor:pointer;
      }
      .mx-diff{display:block;font-size:11px;margin-top:2px}
      .mx-diff.mx-pos{color:#098721}
      .mx-diff.mx-zero{color:#ff9800}
      .mx-diff.mx-neg{color:#f44336}
      .mx-aka{display:block;font-size:11px;color:#777;margin-top:2px}
      table.tabla-clasificacion tr.mx-row-pos td{background:rgba(80,140,90,.22)!important}
      table.tabla-clasificacion tr.mx-row-zero td{background:rgba(210,160,90,.20)!important}
      table.tabla-clasificacion tr.mx-row-neg td{background:rgba(150,70,70,.22)!important}
    `;
    document.head.appendChild(st);
  })();

  /* ==========================================================
     TOP BAR
  ========================================================== */
  function ensureTopBar(){
    if ($('#mx-rank-bar')) return;
    const bar=document.createElement('div');
    bar.id='mx-rank-bar';
    bar.innerHTML=`
      <div class="mx-wrap">
        <strong>pwrd by mx.</strong>
        <button id="mx-save">Save Ranking</button>
        <select id="mx-sel"></select>
        <input id="mx-thr" type="number" placeholder="Delta">
        <button id="mx-apply">Set Delta</button>
        <button id="mx-del">Delete</button>
        <button id="mx-clear">Delete All</button>
        <span id="mx-meta"></span>
      </div>`;
    document.body.prepend(bar);
  }

  /* ==========================================================
     TABLE + DATA
  ========================================================== */
  function findRankingTable(){
    return $('table.tabla-clasificacion');
  }

  function extractPlayers(table){
    const rows=$$('tbody tr',table);
    const out=[];
    for(const tr of rows){
      const c=[...tr.cells];
      if(c.length<6) continue;
      const link=c[1]?.querySelector('a[href*="/jugador/"]');
      const name=link?.textContent.trim();
      const id=link?.href.match(/\/jugador\/(\d+)/)?.[1]||name;
      out.push({
        id,name,row:tr,
        cells:{total:c[5]},
        values:{total:toInt(c[5]?.textContent)}
      });
    }
    return out;
  }

  /* ==========================================================
     SNAPSHOT
  ========================================================== */
  function snapshotFromDom(){
    const table=findRankingTable();
    if(!table) return null;
    const players=extractPlayers(table);
    const map={};
    players.forEach(p=>map[p.id]={total:p.values.total});
    const ts=Date.now();
    return {id:ts,ts,players:map};
  }

  /* ==========================================================
     ANNOTATE
  ========================================================== */
  function annotate(players,base){
    const thr=getThreshold();
    players.forEach(p=>{
      const prev=base?.players?.[p.id];
      if(!prev) return;
      const diff=p.values.total-prev.total;
      const span=document.createElement('span');
      span.className='mx-diff '+(diff>0?'mx-pos':diff<0?'mx-neg':'mx-zero');
      span.textContent='['+sign(diff)+']';
      p.cells.total.appendChild(span);
      p.row.classList.add(
        diff>thr?'mx-row-pos':diff<0?'mx-row-neg':'mx-row-zero'
      );
    });
  }

  /* ==========================================================
     RUN
  ========================================================== */
  function run(){
    ensureTopBar();
    const table=findRankingTable();
    if(!table) return;
    const players=extractPlayers(table);
    const base=getSnapshotById(getBaselineId());
    if(!base) return;
    annotate(players,base);
  }

  run();

})();
