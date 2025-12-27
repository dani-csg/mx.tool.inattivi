// ==UserScript==
// @name         MX.Tool.Inattivi
// @namespace    mx.tool.inattivi
// @version      2.5.0
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

  /* ================= PAGE GUARD ================= */
  function isRankingPage(){
    return location.pathname.replace(/\/+$/, '') === '/clasificacion';
  }
  if (!isRankingPage()) return;

  /* ================= UTILS ================= */
  const $  = (s, r=document)=>r.querySelector(s);
  const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));

  const hostKey = location.host.replace(/^www\./,'');
  const K_ALL   = `mx_rank_snapshots__${hostKey}`;
  const K_BASE  = `mx_rank_baseline_id__${hostKey}`;
  const K_THR   = `mx_rank_total_threshold__${hostKey}`;

  const GM_Get=(k,d)=>{try{return GM_getValue(k,d);}catch{return d;}};
  const GM_Set=(k,v)=>{try{GM_setValue(k,v);}catch{}};

  const toInt = t => parseInt(String(t).replace(/[^0-9\-]/g,''),10)||0;
  const sign  = n => n>0?`+${n}`:`${n}`;

  /* ================= CSS ================= */
  (function addCss(){
    if ($('#mx-rank-css')) return;
    const st=document.createElement('style');
    st.id='mx-rank-css';
    st.textContent=`
      #mx-rank-bar{
        position:sticky;top:0;z-index:2147483647;
        background:#111;color:#eee;
        padding:.4rem .6rem;
        border-bottom:1px solid #333;
        font:13px/1.2 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
      }
      #mx-rank-bar .mx-wrap{
        display:flex;gap:.5rem;align-items:center;flex-wrap:wrap
      }

      #mx-rank-bar button,
      #mx-rank-bar select,
      #mx-rank-bar input{
        padding:.32rem .6rem;
        border:1px solid #555;
        background:#1c1c1c;
        color:#eee;
        border-radius:6px;
        font-size:12px;
        cursor:pointer;
        transition:
          background .15s ease,
          border-color .15s ease,
          box-shadow .15s ease,
          transform .05s ease;
      }

      #mx-rank-bar button:hover,
      #mx-rank-bar select:hover,
      #mx-rank-bar input:hover{
        background:#262626;
        border-color:#888;
        box-shadow:0 0 0 1px rgba(255,255,255,.12);
      }

      #mx-rank-bar button:active{
        transform:translateY(1px);
      }

      #mx-rank-bar input{
        width:90px;
      }

      .mx-diff{display:block;font-size:11px;margin-top:2px}
      .mx-diff.mx-pos{color:#098721}
      .mx-diff.mx-zero{color:#ff9800}
      .mx-diff.mx-neg{color:#f44336}

      table.tabla-clasificacion tr.mx-row-pos td{
        background:rgba(80,140,90,.22)!important}
      table.tabla-clasificacion tr.mx-row-zero td{
        background:rgba(210,160,90,.20)!important}
      table.tabla-clasificacion tr.mx-row-neg td{
        background:rgba(150,70,70,.22)!important}
    `;
    document.head.appendChild(st);
  })();

  /* ================= TOP BAR ================= */
  function ensureTopBar(){
    if ($('#mx-rank-bar')) return;

    const bar=document.createElement('div');
    bar.id='mx-rank-bar';
    bar.innerHTML=`
      <div class="mx-wrap">
        <strong>pwrd by mx.</strong>

        <button id="mx-save" title="Salva classifica">
          Save Ranking
        </button>

        <select id="mx-sel" title="Scegli classifica"></select>

        <input id="mx-thr" type="number"
          title="Inserisci delta semiinattivi"
          placeholder="Delta">

        <button id="mx-apply" title="Salva delta">
          Set Delta
        </button>

        <button id="mx-del" title="Cancella scelta">
          Delete
        </button>

        <button id="mx-clear" title="Cancella tutto">
          Delete All
        </button>

        <span id="mx-meta"></span>
      </div>
    `;
    document.body.prepend(bar);
  }

  /* ================= TABLE ================= */
  function findRankingTable(){
    return $('table.tabla-clasificacion');
  }

  function extractPlayers(table){
    const rows=$$('tbody tr',table);
    const out=[];
    for(const tr of rows){
      const c=[...tr.cells];
      if(c.length<7) continue;
      const link=c[1]?.querySelector('a[href*="/jugador/"]');
      const name=(link?link.textContent:c[1].textContent).trim();
      const id=link?.href.match(/\/jugador\/(\d+)/)?.[1]||name;

      out.push({
        id,row:tr,
        cells:{
          rank:c[0],training:c[2],
          buildings:c[3],troops:c[4],
          total:c[5],buildingsCount:c[6]
        },
        values:{
          rank:toInt(c[0].textContent),
          training:toInt(c[2].textContent),
          buildings:toInt(c[3].textContent),
          troops:toInt(c[4].textContent),
          total:toInt(c[5].textContent),
          buildingsCount:toInt(c[6].textContent)
        }
      });
    }
    return out;
  }

  function annotate(players,base){
    players.forEach(p=>{
      const prev=base.players[p.id];
      if(!prev) return;

      for(const k in p.values){
        const diff=p.values[k]-prev[k];
        const td=p.cells[k];
        if(!td) continue;

        const span=document.createElement('span');
        span.className='mx-diff '+(diff>0?'mx-pos':diff<0?'mx-neg':'mx-zero');
        span.textContent='['+sign(diff)+']';
        td.appendChild(span);

        if(k==='total'){
          p.row.classList.add(
            diff>0?'mx-row-pos':diff<0?'mx-row-neg':'mx-row-zero'
          );
        }
      }
    });
  }

  /* ================= RUN ================= */
  function run(){
    ensureTopBar();
    const table=findRankingTable();
    if(!table) return;

    const players=extractPlayers(table);
    const all=GM_Get(K_ALL,[]);
    const baseId=GM_Get(K_BASE,null);
    const base=all.find(s=>String(s.id)===String(baseId));
    if(!base) return;

    annotate(players,base);
  }

  run();

})();
