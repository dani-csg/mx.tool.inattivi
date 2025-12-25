// ==UserScript==
// @name         MX.Tool.Inattivi
// @namespace    mx.tool.inattivi
// @version      2.3.1
// @description  Tool inattivi per vendettagame.es
// @author       mx.
// @match        *://vendettagame.es/clasificacion*
// @match        *://*.vendettagame.es/clasificacion*
// @run-at       document-end
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @updateURL    https://github.com/dani-csg/mx.tool.inattivi/raw/refs/heads/main/MX.Tool.Inattivi-2.3.0.user.js
// @downloadURL  https://github.com/dani-csg/mx.tool.inattivi/raw/refs/heads/main/MX.Tool.Inattivi-2.3.0.user.js
// ==/UserScript==

(function () {
  'use strict';

  /* ---------- config / debug ---------- */
  const DEBUG = false;
  const log = (...a)=>{ if (DEBUG) console.log('[MX-Inattivi-VG]', ...a); };

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

  // robust für 1.005 / 14.602 / 10,000 / 10.000 etc.
  const toInt = (t)=>{
    if (t==null) return 0;
    const s = String(t)
      .replace(/\[[^\]]*]/g,'')      // [..] entfernen (falls diff schon drin)
      .replace(/\s+/g,'')
      .replace(/[^0-9,\.\-]/g,'');   // nur zahlen + , . -
    if (!s) return 0;

    // Heuristik: tausendertrenner entfernen, letzte , oder . als dezimal ignorieren (wir haben ints)
    const lastComma = s.lastIndexOf(',');
    const lastDot   = s.lastIndexOf('.');
    let clean = s;

    // wenn sowohl , als auch . vorkommen: entferne den, der eher tausender ist
    if (lastComma !== -1 && lastDot !== -1) {
      // meistens: 1.234,56 oder 1,234.56 -> wir wollen int => entferne beide separators
      clean = clean.replace(/[.,]/g,'');
    } else {
      // nur ein separator -> sehr wahrscheinlich tausender => entfernen
      clean = clean.replace(/[.,]/g,'');
    }

    const n = parseInt(clean, 10);
    return Number.isFinite(n) ? n : 0;
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

  /* ---------- CSS ---------- */
  (function addCss(){
    if ($('#mx-rank-css')) return;
    const st=document.createElement('style'); st.id='mx-rank-css';
    st.textContent=`
      #mx-rank-bar{
        position:sticky; top:0; z-index:2147483647; background:#111; color:#eee;
        padding:.35rem .6rem; border-bottom:1px solid #333;
        font:13px/1.2 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
      }
      #mx-rank-bar .mx-wrap{
        display:flex; gap:.5rem; align-items:center; flex-wrap:wrap;
      }
      #mx-rank-bar button,
      #mx-rank-bar select,
      #mx-rank-bar input[type="number"]{
        padding:.28rem .55rem;
        border:1px solid #666;
        background:#1d1d1d;
        color:#eee;
        border-radius:6px;
        font-size:12px;
        cursor:pointer;
        box-sizing:border-box;
        transition:background .15s ease, transform .05s ease, box-shadow .15s ease;
      }
      #mx-rank-bar button:hover,
      #mx-rank-bar select:hover,
      #mx-rank-bar input[type="number"]:hover{
        background:#222;
      }
      #mx-rank-bar button:active{
        transform:translateY(1px) scale(.98);
        box-shadow:0 0 0 1px rgba(255,255,255,.15) inset;
      }
      #mx-thr { width:7rem; }

      .mx-diff{ display:block; font-size:11px; margin-top:2px; opacity:.95 }

      tr.mx-row-pos  > td, tr.mx-row-pos  > th { background: rgba(46,160,67,.32) !important; }
      tr.mx-row-zero > td, tr.mx-row-zero > th { background: rgba(255,167,38,.22) !important; }
      tr.mx-row-neg  > td, tr.mx-row-neg  > th { background: rgba(244,67,54,.32) !important; }

      th.mx-pos, td.mx-pos, th.mx-zero, td.mx-zero, th.mx-neg, td.mx-neg { background: transparent !important; }

      .mx-diff.mx-pos  { color:#098721 }
      .mx-diff.mx-zero { color:#ff9800 }
      .mx-diff.mx-neg  { color:#f44336 }

      th.mx-rank-pos, td.mx-rank-pos{ background:rgba(46,160,67,.18)!important }
      th.mx-rank-zero, td.mx-rank-zero{ background:rgba(255,167,38,.18)!important }
      th.mx-rank-neg,  td.mx-rank-neg{ background:rgba(244,67,54,.18)!important }

      .mx-aka{ display:block; font-size:11px; color:#bbb; margin-top:2px }
      .mx-hide-diffs .mx-diff, .mx-hide-diffs .mx-aka{ display:none!important }
    `;
    document.head.appendChild(st);
  })();

  /* ---------- Top bar helpers ---------- */
  function removeTopBar(){
    const bar = $('#mx-rank-bar');
    if (bar) bar.remove();
  }

  function ensureTopBar(){
    let bar = $('#mx-rank-bar');
    if (bar) return bar;

    bar = document.createElement('div');
    bar.id = 'mx-rank-bar';
    bar.innerHTML = `
      <div class="mx-wrap">
        <strong>pwrd by mx.</strong>
        <button id="mx-save" title="Save the actual ranking">Save Ranking</button>
        <select id="mx-sel" title="Ranking saves (Date/Time)"></select>
        <input id="mx-thr" type="number" min="0" step="1" placeholder="Delta" title="Semi-inactive delta score">
        <button id="mx-apply" title="Set the semi-inactive delta">Set Delta</button>
        <button id="mx-del" title="Delete selected ranking">Delete</button>
        <button id="mx-clear" title="Delete all rankings & delta">Delete All</button>
        <span class="mx-meta" id="mx-meta"></span>
      </div>
    `;
    document.body.prepend(bar);

    $('#mx-thr').value = String(getThreshold() || '');
    $('#mx-thr').addEventListener('change', ()=>{
      setThreshold($('#mx-thr').value);
      annotateAgainstBaseline();
      updateTopMeta();
    });

    $('#mx-save').addEventListener('click', onSaveSnapshot);

    $('#mx-apply').addEventListener('click', ()=>{
      const id = $('#mx-sel').value; if (!id) return;
      setBaselineId(id);
      annotateAgainstBaseline();
      updateTopMeta();
    });

    $('#mx-del').addEventListener('click', ()=>{
      const id = $('#mx-sel').value; if (!id) return;
      if (!confirm('Diesen Snapshot löschen?')) return;
      const all = loadAll().filter(s=>String(s.id)!==String(id));
      saveAll(all);
      if (String(getBaselineId())===String(id)) setBaselineId(all[0]?.id || null);
      refreshTopSnapshotControls();
      annotateAgainstBaseline();
      updateTopMeta();
    });

    $('#mx-clear').addEventListener('click', ()=>{
      if (!confirm('ALLE Snapshots löschen und Delta zurücksetzen? Diese Aktion ist endgültig.')) return;
      GM_Del(K_ALL); GM_Del(K_BASE); GM_Del(K_THR);
      const thrInput = $('#mx-thr'); if (thrInput){ thrInput.value=''; }
      cleanupDiffs();
      refreshTopSnapshotControls();
      updateTopMeta();
      alert('Alle Snapshots gelöscht und Delta zurückgesetzt.');
    });

    refreshTopSnapshotControls();
    updateTopMeta();
    return bar;
  }

  function refreshTopSnapshotControls(){
    const sel = $('#mx-sel'); if (!sel) return;
    const all = loadAll().slice().sort((a,b)=>b.id-a.id);
    const baseId = getBaselineId();
    sel.innerHTML = '';

    for (const s of all){
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = fmt(s.ts || s.id);
      if (String(baseId)===String(s.id)) opt.selected = true;
      sel.appendChild(opt);
    }

    if (!all.length){
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Kein Snapshot';
      sel.appendChild(opt);
    }
  }

  function updateTopMeta(){
    const all = loadAll();
    const base = getSnapshotById(getBaselineId());
    const thr  = getThreshold();
    const meta = $('#mx-meta');
    if (meta) meta.textContent = (base ? `Baseline: ${fmt(base.ts)} — ` : '') + `Snapshots: ${all.length} — Δ: ${thr}`;
  }

  /* ---------- Table detection (VendettaGame.es) ---------- */
  function findRankingTable(DOC=document){
    // vendettagame.es hat eine stabile Klasse:
    const t = $('table.tabla-clasificacion', DOC);
    if (t) return t;

    // fallback: irgendeine table mit "NOMBRE" + "SUMA"
    const candidates = $$('table', DOC);
    let best=null, bestScore=-1;
    for (const tb of candidates){
      const headRow = tb.tHead?.rows?.[0] || tb.rows?.[0];
      if (!headRow) continue;
      const head = [...headRow.cells].map(c=>c.textContent.trim().toLowerCase());
      const joined = ' ' + head.join(' ') + ' ';
      let sc=0;
      if (joined.includes('nombre') || joined.includes('nome') || joined.includes('name')) sc+=2;
      if (joined.includes('suma') || joined.includes('total') || joined.includes('totali') || joined.includes('gesamt')) sc+=2;
      if (headRow.cells.length>=6) sc+=1;
      if (sc>bestScore){ bestScore=sc; best=tb; }
    }
    return bestScore>=3 ? best : null;
  }

  /* ---------- Extract rows ---------- */
  function extractPlayers(table){
    if (!table || !table.rows || table.rows.length<2) return [];

    const bodyRows = $$('tbody tr', table);
    if (!bodyRows.length) return [];

    const out=[];
    for (const tr of bodyRows){
      const cells = [...tr.cells];
      if (cells.length < 6) continue;

      const rankCell      = cells[0];
      const nameCell      = cells[1];
      const trainingCell  = cells[2];
      const buildingsCell = cells[3];
      const troopsCell    = cells[4];
      const totalCell     = cells[5];
      const bcountCell    = cells[6];

      const rank = toInt(rankCell?.textContent);

      // Wichtig: im Name-Cell gibt's u.U. zuerst Clan-Link -> wir brauchen /jugador/
      const link = nameCell?.querySelector('a[href*="/jugador/"]');
      const name = (link ? link.textContent : nameCell?.textContent || '').trim();

      let id=null;
      const href = link?.getAttribute('href') || '';
      const m = href.match(/\/jugador\/(\d+)/);
      if (m) id = m[1];
      if (!id) id='name:'+name;

      out.push({
        id, name, row:tr,
        cells:{
          rank:rankCell, name:nameCell, training:trainingCell, buildings:buildingsCell,
          troops:troopsCell, total:totalCell, buildingsCount:bcountCell
        },
        values:{
          rank,
          training: toInt(trainingCell?.textContent),
          buildings: toInt(buildingsCell?.textContent),
          troops: toInt(troopsCell?.textContent),
          total: toInt(totalCell?.textContent),
          buildingsCount: toInt(bcountCell?.textContent)
        }
      });
    }
    return out;
  }

  /* ---------- Snapshot ---------- */
  function currentSnapshotFromDom(DOC=document){
    const table = findRankingTable(DOC);
    if (!table) return null;

    const players = extractPlayers(table);
    if (!players.length) return null;

    const map = {};
    for (const p of players){
      map[p.id] = { name:p.name, ...p.values };
    }
    const ts = Date.now();
    return { id: ts, ts, players: map };
  }

  function onSaveSnapshot(){
    const snap = currentSnapshotFromDom();
    if (!snap){
      alert('Snapshot fehlgeschlagen: Tabelle nicht gefunden oder leer.');
      return;
    }
    const all = loadAll();
    all.push(snap);
    all.sort((a,b)=>a.id-b.id);
    while (all.length>MAX_SNAPSHOTS) all.shift();
    saveAll(all);

    setBaselineId(snap.id);
    refreshTopSnapshotControls();
    updateTopMeta();
    annotateAgainstBaseline();
    alert('Snapshot gespeichert: ' + fmt(snap.ts));
  }

  /* ---------- Row tint helpers ---------- */
  function applyRowTint(tr, kind){
    tr.classList.remove('mx-row-pos','mx-row-zero','mx-row-neg');
    if (kind==='pos') tr.classList.add('mx-row-pos');
    else if (kind==='neg') tr.classList.add('mx-row-neg');
    else tr.classList.add('mx-row-zero');
  }
  function clearRowTint(tr){
    tr.classList.remove('mx-row-pos','mx-row-zero','mx-row-neg');
  }

  /* ---------- Diffs ---------- */
  function cleanupDiffs(){
    $$('.mx-diff,.mx-aka').forEach(n=>n.remove());
    const cellCls=['mx-pos','mx-zero','mx-neg','mx-rank-pos','mx-rank-zero','mx-rank-neg'];
    $$('th,td').forEach(td=>cellCls.forEach(c=>td.classList.remove(c)));
    $$('table tr').forEach(clearRowTint);
  }

  function annotate(players, baseline){
    const thr = getThreshold();

    for (const p of players){
      const prev = baseline?.players?.[p.id];

      if (prev && prev.name && prev.name!==p.name){
        const aka=document.createElement('span');
        aka.className='mx-aka';
        aka.textContent='aka: '+prev.name;
        p.cells.name?.appendChild(aka);
      }

      const metrics=[ ['rank',true], ['training',false], ['buildings',false], ['troops',false], ['total',false], ['buildingsCount',false] ];
      let rowClassSet = false;

      for (const [key,isRank] of metrics){
        const td=p.cells[key]; if(!td) continue;
        td.querySelectorAll('.mx-diff').forEach(n=>n.remove());
        if (!prev) continue;

        const cur=p.values[key]??0, old=prev[key]??0, diff=cur-old;

        const span=document.createElement('span');
        let cls;
        if (diff===0) cls = 'mx-zero';
        else if (isRank) cls = (diff < 0 ? 'mx-pos' : 'mx-neg'); // rank: negative = besser
        else cls = (diff > 0 ? 'mx-pos' : 'mx-neg');

        span.className = 'mx-diff ' + cls;
        span.textContent='['+sign(diff)+']';
        td.appendChild(span);

        if (isRank){
          if (diff<0) td.classList.add('mx-rank-pos');
          else if (diff===0) td.classList.add('mx-rank-zero');
          else td.classList.add('mx-rank-neg');
        }

        if (!rowClassSet && key==='total'){
          if (diff > 0){
            if (diff >= thr) applyRowTint(p.row,'pos');   // aktiv
            else             applyRowTint(p.row,'zero');  // semi-aktiv
          } else if (diff < 0){
            applyRowTint(p.row,'neg');                    // rückläufig
          } else {
            applyRowTint(p.row,'zero');                   // 0
          }
          rowClassSet = true;
        }
      }
    }
  }

  /* ---------- Stable run ---------- */
  let isUpdating=false;

  function isRankingPage(){
    // läuft auf /clasificacion und allen Unterseiten
    return /^\/clasificacion(\/|$)/.test(location.pathname);
  }

  function annotateAgainstBaseline(){
    if (isUpdating) return;

    if (!isRankingPage()){
      removeTopBar();
      return;
    }

    const table = findRankingTable();
    if (!table){
      removeTopBar();
      return;
    }

    ensureTopBar();

    const players = extractPlayers(table);
    if (!players.length){ updateTopMeta(); return; }

    let base = getSnapshotById(getBaselineId());
    if (!base){
      const all=loadAll();
      if (all.length) base=all[all.length-1];
    }

    isUpdating=true;
    try{
      cleanupDiffs();
      if (base) annotate(players, base);
    } finally {
      setTimeout(()=>{ isUpdating=false; }, 80);
    }
    updateTopMeta();
  }

  function run(){ annotateAgainstBaseline(); }

  // initial
  run();

  // MutationObserver (debounced)
  const content = document.body;
  let pending = null;
  const obs = new MutationObserver(()=>{
    if (pending) return;
    pending = setTimeout(()=>{ pending=null; run(); }, 150);
  });
  obs.observe(content, {childList:true, subtree:true});

})();
