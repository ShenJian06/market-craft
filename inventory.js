// inventory.js — inventory + hotbar + money-gated plot expansion (UPDATED v1.1)
// Exposes: window.Inventory
//
// ✅ Adds: getState()/setState() for save/load (money, plotLevel, counts, selection)
// ✅ Filters legacy items out of hotbar (glass_sliding_door never shows)
// ✅ Supports startCounts overrides + separate defaults for blocks vs furniture
// ✅ Safe when Catalog not loaded yet (furniture list can be refreshed via refreshFromCatalog())

(function(){
  "use strict";

  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }

  function create(opts={}){
    // -------------------------
    // Money / progression
    // -------------------------
    let money = Number.isFinite(opts.startMoney) ? +opts.startMoney : 250;

    const plotUpgrades = Array.isArray(opts.plotUpgrades) ? opts.plotUpgrades.slice() : [
      { id:"plot_1", cost: 500,  expand:{ x:2, z:2 } },
      { id:"plot_2", cost: 1200, expand:{ x:3, z:3 } },
      { id:"plot_3", cost: 2500, expand:{ x:4, z:4 } },
      { id:"plot_4", cost: 5000, expand:{ x:6, z:6 } },
    ];
    let plotLevel = Number.isFinite(opts.startPlotLevel) ? (opts.startPlotLevel|0) : 0;

    function getMoney(){ return money; }
    function addMoney(v){
      money = Math.max(0, money + (+v||0));
      return money;
    }
    function spendMoney(v){
      v = +v||0;
      if(v <= 0) return true;
      if(money < v) return false;
      money -= v;
      return true;
    }

    function getNextPlotUpgrade(){ return plotUpgrades[plotLevel] || null; }
    function canAffordPlotUpgrade(){
      const up = getNextPlotUpgrade();
      return !!(up && money >= up.cost);
    }
    function buyNextPlotUpgrade(){
      const up = getNextPlotUpgrade();
      if(!up) return null;
      if(!spendMoney(up.cost)) return null;
      plotLevel++;
      return up;
    }

    // -------------------------
    // Inventory items
    // -------------------------
    const baseItems = [
      { id:"floor",  name:"Floor",  icon:"▦", kind:"block" },
      { id:"wall",   name:"Wall",   icon:"■", kind:"block" },
      { id:"slab",   name:"Slab",   icon:"▭", kind:"block" },
      { id:"glass",  name:"Glass",  icon:"▢", kind:"block" },
      { id:"window", name:"Window", icon:"▣", kind:"block" },
      { id:"door",   name:"Door",   icon:"▥", kind:"block" }, // block-door (din Builder)
    ];

    // Builds furniture items from Catalog; filters legacy guaranteed
    function buildFurnitureItems(){
      const list = (window.Catalog && Array.isArray(window.Catalog.FURNITURE)) ? window.Catalog.FURNITURE : [];
      return list
        .filter(f => f && f.id && f.id !== "glass_sliding_door") // ✅ never show legacy
        .map(f => ({ id:f.id, name:f.name, icon:(f.icon||"⬛"), kind:"furniture" }));
    }

    let ITEMS = baseItems.concat(buildFurnitureItems());

    // counts storage
    const counts = Object.create(null);

    // defaults: separate for blocks/furniture; can be overridden
    const defaultBlockCount    = Number.isFinite(opts.startCountBlocks)    ? (opts.startCountBlocks|0)    : (Number.isFinite(opts.startCount) ? (opts.startCount|0) : 99);
    const defaultFurnitureCount= Number.isFinite(opts.startCountFurniture) ? (opts.startCountFurniture|0) : (Number.isFinite(opts.startCount) ? (opts.startCount|0) : 99);

    // per-item override map
    const startCounts = (opts.startCounts && typeof opts.startCounts === "object") ? opts.startCounts : null;

    function initCounts(){
      for(const it of ITEMS){
        let v = (it.kind === "block") ? defaultBlockCount : defaultFurnitureCount;
        if(startCounts && Object.prototype.hasOwnProperty.call(startCounts, it.id)){
          v = startCounts[it.id] | 0;
        }
        if(!Number.isFinite(v)) v = 0;
        counts[it.id] = Math.max(0, v|0);
      }
    }
    initCounts();

    function getCount(id){ return counts[id] || 0; }
    function setCount(id, v){ counts[id] = Math.max(0, v|0); }
    function give(id, qty=1){
      qty = qty|0; if(qty<=0) return;
      counts[id] = (counts[id]||0) + qty;
    }
    function take(id, qty=1){
      qty = qty|0; if(qty<=0) return true;
      const cur = counts[id]||0;
      if(cur < qty) return false;
      counts[id] = cur - qty;
      return true;
    }

    // -------------------------
    // Hotbar paging
    // -------------------------
    let selected = Number.isFinite(opts.startSelectedIndex) ? (opts.startSelectedIndex|0) : 0;
    let pageStart = 0;
    const pageSize = 10;

    function updatePage(){ pageStart = Math.floor(selected / pageSize) * pageSize; }

    function getSelectedItem(){ return ITEMS[selected]; }

    function setSelected(idx){
      selected = clamp(idx|0, 0, ITEMS.length-1);
      updatePage();
    }

    function setSelectedInPage(slotIndex0to9){
      const idx = pageStart + (slotIndex0to9|0);
      if(idx >= 0 && idx < ITEMS.length){
        setSelected(idx);
        return true;
      }
      return false;
    }

    function cycle(dir){
      const n = ITEMS.length;
      selected = (selected + (dir|0) + n) % n;
      updatePage();
    }

    updatePage();
    setSelected(selected);

    // -------------------------
    // Catalog refresh (optional)
    // -------------------------
    function refreshFromCatalog(){
      const oldSelectedId = (ITEMS[selected] && ITEMS[selected].id) ? ITEMS[selected].id : null;

      ITEMS = baseItems.concat(buildFurnitureItems());

      // ensure counts exist for new items
      for(const it of ITEMS){
        if(!Object.prototype.hasOwnProperty.call(counts, it.id)){
          const v = (it.kind === "block") ? defaultBlockCount : defaultFurnitureCount;
          counts[it.id] = Math.max(0, v|0);
        }
      }

      // restore selection by id if possible
      if(oldSelectedId){
        const idx = ITEMS.findIndex(it => it.id === oldSelectedId && it.kind === (ITEMS[selected]?.kind||it.kind));
        if(idx >= 0) selected = idx;
      }
      selected = clamp(selected, 0, ITEMS.length-1);
      updatePage();
    }

    // -------------------------
    // Save/Load state API
    // -------------------------
    function getState(){
      return {
        money,
        plotLevel,
        selected,
        counts: Object.assign({}, counts)
      };
    }

    function setState(state){
      if(!state || typeof state !== "object") return false;

      if(Number.isFinite(state.money)) money = Math.max(0, +state.money);
      if(Number.isFinite(state.plotLevel)) plotLevel = Math.max(0, state.plotLevel|0);

      if(state.counts && typeof state.counts === "object"){
        for(const k in state.counts){
          if(!Object.prototype.hasOwnProperty.call(state.counts, k)) continue;
          counts[k] = Math.max(0, (state.counts[k]|0));
        }
      }

      if(Number.isFinite(state.selected)){
        selected = clamp(state.selected|0, 0, ITEMS.length-1);
        updatePage();
      }
      return true;
    }

    return {
      // inventory
      get ITEMS(){ return ITEMS; },
      counts,
      getCount,
      setCount,
      give,
      take,

      // selection
      getSelectedItem,
      setSelected,
      setSelectedInPage,
      cycle,
      get selectedIndex(){ return selected; },
      get pageStart(){ return pageStart; },
      get pageSize(){ return pageSize; },

      // money / progression
      getMoney,
      addMoney,
      spendMoney,
      get plotLevel(){ return plotLevel; },
      get plotUpgrades(){ return plotUpgrades; },
      getNextPlotUpgrade,
      canAffordPlotUpgrade,
      buyNextPlotUpgrade,

      // catalog sync + save/load
      refreshFromCatalog,
      getState,
      setState
    };
  }

  window.Inventory = { create };
})();
