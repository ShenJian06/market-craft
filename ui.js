// ui.js — HUD render + toasts (paged hotbar)
// Exposes: window.UI

(function(){
  "use strict";

  function create({ inventory }){
    const modePill = document.getElementById("modePill");
    const hotbar = document.getElementById("hotbar");
    const hotbarPage = document.getElementById("hotbarPage");
    const toast = document.getElementById("toast");

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
        el.innerHTML = `
          <div class="n">${slotNo === 10 ? 0 : slotNo}</div>
          <div class="label">${it.icon} ${it.name}</div>
          <div class="count">${inventory.counts[it.id] ?? 0}</div>
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

    function tick(){
      renderHotbar();
      if(!toast.classList.contains("hidden") && performance.now() > toastT){
        toast.classList.add("hidden");
      }
    }

    return { tick, setMode, showToast };
  }

  window.UI = { create };
})();
