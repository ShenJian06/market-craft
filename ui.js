// ui.js — HUD render + toasts (paged hotbar + money + plot upgrade hint) (UPDATED)
// Exposes: window.UI
(function(){
  "use strict";

  function moneyFmt(v){
    v = +v || 0;
    return "$" + Math.round(v).toString();
  }

  function create({ inventory }){
    const modePill = document.getElementById("modePill");
    const hotbar = document.getElementById("hotbar");
    const hotbarPage = document.getElementById("hotbarPage");
    const toast = document.getElementById("toast");

    // OPTIONAL elements (won't crash if missing)
    const moneyEl = document.getElementById("moneyPill");
    const plotEl  = document.getElementById("plotPill");

    function renderTopPills(){
      if(moneyEl){
        const m = (inventory.getMoney ? inventory.getMoney() : 0);
        moneyEl.textContent = `MONEY ${moneyFmt(m)}`;
      }
      if(plotEl){
        const next = inventory.getNextPlotUpgrade ? inventory.getNextPlotUpgrade() : null;
        if(!next){
          plotEl.textContent = "PLOT MAX";
          plotEl.style.opacity = "0.85";
        } else {
          const affordable = inventory.canAffordPlotUpgrade && inventory.canAffordPlotUpgrade();
          plotEl.textContent = `U: EXPAND ${moneyFmt(next.cost)}`;
          plotEl.style.opacity = affordable ? "1" : "0.75";
        }
      }
    }

    function renderHotbar(){
      hotbar.innerHTML = "";

      const start = inventory.pageStart;
      const end = Math.min(inventory.ITEMS.length, start + inventory.pageSize);
      const pageIdx = Math.floor(inventory.selectedIndex / inventory.pageSize) + 1;
      const pages = Math.max(1, Math.ceil(inventory.ITEMS.length / inventory.pageSize));

      hotbarPage.textContent = `HOTBAR ${pageIdx}/${pages}`;

      for(let i=start;i<end;i++){
        const it = inventory.ITEMS[i];
        const slotNo = (i - start) + 1; // 1..10

        const el = document.createElement("div");
        el.className = "slot" + (i === inventory.selectedIndex ? " sel" : "");

        const count = (inventory.getCount ? inventory.getCount(it.id) : (inventory.counts[it.id] ?? 0));

        el.innerHTML = `
          <div class="n">${slotNo === 10 ? 0 : slotNo}</div>
          <div class="label">${it.icon} ${it.name}</div>
          <div class="count">${count}</div>
        `;
        hotbar.appendChild(el);
      }
    }

    let toastT = 0;
    function showToast(msg, ms=1200){
      toast.textContent = msg;
      toast.classList.remove("hidden");
      toastT = performance.now() + ms;
    }

    function setMode(isBuild){
      modePill.textContent = isBuild ? "BUILD" : "PLAY";
      modePill.style.borderColor = isBuild ? "rgba(45,212,255,.55)" : "rgba(255,255,255,.18)";
      modePill.style.boxShadow = isBuild ? "0 0 0 6px rgba(45,212,255,.12)" : "none";
    }

    // Render at most ~12fps (hotbar updates are cheap but let's keep it smooth)
    let _nextHud = 0;
    function tick(){
      const now = performance.now();
      if(now >= _nextHud){
        _nextHud = now + 80; // ~12.5fps
        renderTopPills();
        renderHotbar();
      }

      if(!toast.classList.contains("hidden") && now > toastT){
        toast.classList.add("hidden");
      }
    }

    // First draw
    renderTopPills();
    renderHotbar();

    return { tick, setMode, showToast };
  }

  window.UI = { create };
})();
