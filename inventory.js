// inventory.js — inventory + hotbar (supports blocks + furniture)
// Exposes: window.Inventory

(function(){
  "use strict";

  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }

  function create(){
    // Blocks (craft/build)
    const baseItems = [
      { id:"floor",  name:"Floor",  icon:"▦", kind:"block" },
      { id:"wall",   name:"Wall",   icon:"■", kind:"block" },
      { id:"slab",   name:"Slab",   icon:"▭", kind:"block" },
      { id:"glass",  name:"Glass",  icon:"▢", kind:"block" },
      { id:"window", name:"Window", icon:"▣", kind:"block" },
      { id:"door",   name:"Door",   icon:"▥", kind:"block" },
    ];

    // Furniture (from Catalog)
    const furn = (window.Catalog?.FURNITURE || []).map(f => ({
      id: f.id,
      name: f.name,
      icon: f.icon || "⬛",
      kind: "furniture"
    }));

    const ITEMS = baseItems.concat(furn);

    const counts = Object.create(null);
    for(const it of ITEMS) counts[it.id] = 99;

    let selected = 0;
    let pageStart = 0;
    const pageSize = 10;

    function updatePage(){
      pageStart = Math.floor(selected / pageSize) * pageSize;
    }

    function getSelectedItem(){
      return ITEMS[selected];
    }

    function setSelected(idx){
      selected = clamp(idx|0, 0, ITEMS.length-1);
      updatePage();
    }

    function setSelectedInPage(slotIndex0to9){
      const idx = pageStart + slotIndex0to9;
      if(idx >= 0 && idx < ITEMS.length){
        setSelected(idx);
        return true;
      }
      return false;
    }

    function cycle(dir){
      const n = ITEMS.length;
      selected = (selected + dir + n) % n;
      updatePage();
    }

    updatePage();

    return {
      ITEMS,
      counts,
      getSelectedItem,
      setSelected,
      setSelectedInPage,
      cycle,
      get selectedIndex(){ return selected; },
      get pageStart(){ return pageStart; },
      get pageSize(){ return pageSize; }
    };
  }

  window.Inventory = { create };
})();
