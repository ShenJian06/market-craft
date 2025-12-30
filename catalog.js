// catalog.js — products + furniture registry (low poly, grid 1m) (UPDATED v5.2)
// ✅ FIX: glass DoubleSide + depthWrite=false (nu mai "dispar" fețele și merge corect din orice unghi)
// ✅ Keeps: unified auto-door API for ANY door furniture (all isDoor:true) + legacy support
// ✅ Keeps: passOpenThreshold API
// Exposes: window.Catalog
(function(){
  "use strict";

  const PRODUCTS = [
    { id:"water",        name:"Water",        price:1.29, category:"Drinks" },
    { id:"soda",         name:"Soda",         price:1.99, category:"Drinks" },
    { id:"chips",        name:"Chips",        price:2.49, category:"Snacks" },
    { id:"cereal",       name:"Cereal",       price:3.99, category:"Food" },
    { id:"cat_food",     name:"Cat Food",     price:5.49, category:"Pets" },
    { id:"minced_meat",  name:"Minced Meat",  price:6.99, category:"Food" },
  ];

  function mat(color, opts={}){
    return new THREE.MeshStandardMaterial(Object.assign({
      color,
      roughness: 0.9,
      metalness: 0.0
    }, opts));
  }

  // 1 cell = 1 meter
  // floor thickness = 0.10m -> floor top at 0.10
  const FLOOR_THICK = 0.10;
  const FLOOR_TOP   = FLOOR_THICK;

  // (0.10 podea) + (2.90 ușă/fereastră) = 3.00
  const OPENING_H = 3.0 - FLOOR_TOP;

  const M = {
    metal:  mat(0x6b7280, { roughness:0.65, metalness:0.35 }),
    metal2: mat(0x9ca3af, { roughness:0.55, metalness:0.35 }),
    white:  mat(0xe5e7eb, { roughness:0.92 }),
    dark:   mat(0x111827, { roughness:0.70 }),
    red:    mat(0xef4444, { roughness:0.85 }),
    blue:   mat(0x2563eb, { roughness:0.85 }),
    wood:   mat(0xb7794a, { roughness:0.92 }),
    wood2:  mat(0x9a6a3d, { roughness:0.92 }),
    sand:   mat(0xd7c49d, { roughness:0.95 }),
    green:  mat(0x22c55e, { roughness:0.92 }),

    // ✅ glass corect (vizibil din ambele părți + fără auto-occlusion)
    glass: new THREE.MeshStandardMaterial({
      color:0x6fb7dd,
      roughness:0.05,
      metalness:0.10,
      transparent:true,
      opacity:0.32,
      side: THREE.DoubleSide,
      depthWrite:false
    })
  };

  // size = [W,H,D] in meters
  // footprint = [cellsX, cellsZ]
  const FURNITURE = [
    { id:"cashier_counter", name:"Cashier", icon:"🧾", size:[3.0, 1.05, 1.0], yOffset:0.0, footprint:[3,1], solid:true },
    { id:"aisle_shelf",     name:"Shelf",   icon:"🗄️", size:[1.0, 2.25, 0.55], yOffset:0.0, footprint:[1,1], solid:true },
    { id:"fridge_wall",     name:"Fridge",  icon:"🧊", size:[1.0, 2.20, 0.85], yOffset:0.0, footprint:[1,1], solid:true },
    { id:"pallet",          name:"Pallet",  icon:"📦", size:[1.0, 0.22, 1.0], yOffset:0.0, footprint:[1,1], solid:true },
    { id:"produce_stand",   name:"Produce", icon:"🥦", size:[1.0, 1.60, 1.0], yOffset:0.0, footprint:[1,1], solid:true },

    // ✅ DOAR 2 uși glisante în inventar
    { id:"sliding_door_single", name:"Sliding Door (2m x 3m)", icon:"🚪",
      size:[2.0, OPENING_H, 0.25], yOffset:FLOOR_TOP, footprint:[2,1],
      solid:true, isDoor:true, autoFloor:true,
      door:{ type:"slide", range:2.8, speed:7.0, passOpenThreshold:0.72 }
    },
    { id:"sliding_door_wide",   name:"Sliding Door (3m x 3m)", icon:"🚪",
      size:[3.0, OPENING_H, 0.25], yOffset:FLOOR_TOP, footprint:[3,1],
      solid:true, isDoor:true, autoFloor:true,
      door:{ type:"slide", range:3.0, speed:7.0, passOpenThreshold:0.72 }
    },

    { id:"window_tall_1", name:"Window (1m x 3m)", icon:"🪟",
      size:[1.0, OPENING_H, 0.25], yOffset:FLOOR_TOP, footprint:[1,1],
      solid:true, autoFloor:true
    },
    { id:"window_tall_2", name:"Window (2m x 3m)", icon:"🪟",
      size:[2.0, OPENING_H, 0.25], yOffset:FLOOR_TOP, footprint:[2,1],
      solid:true, autoFloor:true
    },
  ];

  const FURN_BY_ID = Object.create(null);
  for(const f of FURNITURE) FURN_BY_ID[f.id] = f;

  // ✅ legacy support
  FURN_BY_ID["glass_sliding_door"] = Object.assign({}, FURN_BY_ID["sliding_door_single"], {
    id:"glass_sliding_door",
    name:"Glass Door (legacy)",
    isDoor:true,
    autoFloor:true,
    door:{ type:"slide", range:2.8, speed:7.0, passOpenThreshold:0.72 }
  });

  function addBox(g, w,h,d, x,y,z, material){
    const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), material);
    m.position.set(x,y,z);
    m.castShadow = true;
    m.receiveShadow = true;
    // ✅ transparent safety
    if(m.material && m.material.transparent){
      m.material.depthWrite = false;
      m.material.side = THREE.DoubleSide;
    }
    g.add(m);
    return m;
  }

  // -------------------------
  // MODELS
  // Origin: centered X/Z, base at Y=0
  // -------------------------

  function makeCashierCounter(def){
    const g = new THREE.Group();
    const W = def.size[0], D = def.size[2];

    const bodyH = 0.92;
    addBox(g, W, bodyH, D, 0, bodyH/2, 0, mat(0xd1a2b8, { roughness:0.92 }));
    addBox(g, W+0.04, 0.08, D+0.04, 0, bodyH + 0.04, 0, mat(0xefe7ff, { roughness:0.75 }));
    addBox(g, W*0.42, 0.03, D*0.70, W*0.12, bodyH + 0.065, 0, mat(0x1f2937, { roughness:0.85 }));

    addBox(g, 0.36, 0.16, 0.28, -W/2 + 0.38, bodyH + 0.08, -D/2 + 0.28, mat(0xe5e7eb,{roughness:0.92}));
    addBox(g, 0.30, 0.18, 0.05, -W/2 + 0.40, bodyH + 0.22, -D/2 + 0.23, mat(0x0b1022, { roughness:0.35 }));
    addBox(g, 0.20, 0.06, 0.18, -W/2 + 0.78, bodyH + 0.06, -D/2 + 0.30, mat(0x111827,{roughness:0.70}));

    addBox(g, 0.55, 0.78, 0.85, -W/2 + 0.15, 0.39, 0, mat(0xc98aa7, { roughness:0.92 }));

    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.05,0.55,10), mat(0x6b7280,{roughness:0.65, metalness:0.35}));
    leg.position.set(W/2 - 0.35, 0.275, D/2 - 0.22);
    leg.castShadow = true; leg.receiveShadow = true;
    g.add(leg);

    const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.18,0.18,0.07,12), mat(0x374151,{roughness:0.9}));
    seat.position.set(W/2 - 0.35, 0.61, D/2 - 0.22);
    seat.castShadow = true; seat.receiveShadow = true;
    g.add(seat);

    return g;
  }

  function makeAisleShelf(def){
    const g = new THREE.Group();
    const W = def.size[0], H = def.size[1], D = def.size[2];

    const upr = 0.045;
    const xU = W/2 - upr/2;
    addBox(g, upr, H, D, -xU, H/2, 0, mat(0x9ca3af,{roughness:0.55, metalness:0.35}));
    addBox(g, upr, H, D,  xU, H/2, 0, mat(0x9ca3af,{roughness:0.55, metalness:0.35}));

    addBox(g, W - upr*2, H, 0.03, 0, H/2, -D/2 + 0.015, mat(0xe5e7eb,{roughness:0.92}));
    addBox(g, W, 0.12, D, 0, 0.06, 0, mat(0xd1d5db,{roughness:0.95}));

    const shelves = 5;
    const innerW = W - upr*2 - 0.02;
    const innerD = D - 0.06;
    for(let i=0;i<shelves;i++){
      const y = 0.28 + i*((H-0.55)/(shelves-1));
      addBox(g, innerW, 0.04, innerD, 0, y, 0.01, mat(0xf3f4f6,{roughness:0.95}));
      addBox(g, innerW, 0.03, 0.03, 0, y+0.02, D/2 - 0.035, mat(0xe5e7eb,{roughness:0.95}));
    }

    addBox(g, W, 0.12, 0.10, 0, H - 0.06, -D/2 + 0.05, mat(0xe5e7eb,{roughness:0.92}));
    return g;
  }

  function makeFridgeWall(def){
    const g = new THREE.Group();
    const W = def.size[0], H = def.size[1], D = def.size[2];

    addBox(g, W, H, D, 0, H/2, 0, mat(0xcfd5dd,{roughness:0.35, metalness:0.55}));
    addBox(g, W-0.10, H-0.20, D-0.22, 0, H/2 + 0.02, -0.04, mat(0x1f2937,{roughness:0.92}));

    const glassZ = D/2 - 0.04;
    const door = addBox(g, W-0.08, H-0.18, 0.06, 0, H/2, glassZ, M.glass);
    door.material.opacity = 0.26;

    addBox(g, 0.05, 0.95, 0.04, W/2 - 0.12, H*0.55, glassZ+0.01, mat(0x9ca3af,{roughness:0.4, metalness:0.6}));

    const shelfMat = mat(0xaab2bd,{roughness:0.55, metalness:0.2});
    for(let i=0;i<5;i++){
      addBox(g, W-0.18, 0.03, D-0.30, 0, 0.45 + i*0.32, -0.06, shelfMat);
    }

    addBox(g, W, 0.18, 0.08, 0, 0.09, D/2 - 0.08, mat(0x9aa3ad,{roughness:0.45, metalness:0.55}));
    addBox(g, W, 0.16, D, 0, H - 0.08, 0, mat(0xd7dde5,{roughness:0.35, metalness:0.55}));
    return g;
  }

  function makePallet(def){
    const g = new THREE.Group();
    const W = def.size[0], H = def.size[1], D = def.size[2];
    const wood = mat(0xb7794a,{roughness:0.92});

    addBox(g, W-0.06, 0.05, 0.12, 0, 0.025, -D/2 + 0.18, wood);
    addBox(g, W-0.06, 0.05, 0.12, 0, 0.025,  0.00, wood);
    addBox(g, W-0.06, 0.05, 0.12, 0, 0.025,  D/2 - 0.18, wood);

    const bx = [-W/2 + 0.18, 0, W/2 - 0.18];
    const bz = [-D/2 + 0.18, 0, D/2 - 0.18];
    for(const x of bx){
      for(const z of bz){
        addBox(g, 0.10, 0.10, 0.10, x, 0.10, z, mat(0x9a6a3d,{roughness:0.92}));
      }
    }

    const slats = 7;
    for(let i=0;i<slats;i++){
      const z = -D/2 + 0.12 + i*((D-0.24)/(slats-1));
      addBox(g, W-0.06, 0.04, 0.09, 0, H - 0.02, z, wood);
    }
    return g;
  }

  function makeProduceStand(def){
    const g = new THREE.Group();
    const W = def.size[0], H = def.size[1], D = def.size[2];

    const frame = mat(0x111827, { roughness:0.8, metalness:0.15 });
    const crate = mat(0xcaa77a, { roughness:0.92 });
    const crate2= mat(0xb48b5f, { roughness:0.92 });

    addBox(g, W, 0.08, D, 0, 0.04, 0, frame);
    addBox(g, 0.06, 1.15, D, -W/2+0.03, 0.575, 0, frame);
    addBox(g, 0.06, 1.15, D,  W/2-0.03, 0.575, 0, frame);
    addBox(g, W-0.10, 0.50, D-0.10, 0, 0.25, 0, mat(0x1f2937,{roughness:0.9}));

    const levels = [
      { y:0.70, z: 0.18, rot:-0.22 },
      { y:1.05, z: 0.08, rot:-0.22 },
      { y:1.38, z:-0.02, rot:-0.22 },
    ];
    for(let li=0; li<levels.length; li++){
      const L = levels[li];

      const tray = new THREE.Mesh(new THREE.BoxGeometry(W-0.12, 0.10, D*0.70), crate);
      tray.position.set(0, L.y, L.z);
      tray.rotation.x = L.rot;
      tray.castShadow = true; tray.receiveShadow = true;
      g.add(tray);

      const lip = new THREE.Mesh(new THREE.BoxGeometry(W-0.10, 0.06, 0.06), crate2);
      lip.position.set(0, L.y + 0.05, L.z + (D*0.35));
      lip.rotation.x = L.rot;
      lip.castShadow = true; lip.receiveShadow = true;
      g.add(lip);
    }

    addBox(g, W, 0.06, D, 0, H - 0.03, -D*0.15, frame);
    return g;
  }

  // 3m total (cu FLOOR_TOP): ușă glisantă cu transom sus
  function makeSlidingDoorEntrance(def){
    const g = new THREE.Group();
    const W = def.size[0], H = def.size[1], D = def.size[2];

    const frame = mat(0xcfd5dd,{roughness:0.35, metalness:0.55});
    const rail  = mat(0xb6bec8,{roughness:0.40, metalness:0.55});
    const stileMat  = mat(0x9aa3ad,{roughness:0.45, metalness:0.55});
    const handleMat = mat(0x6b7280,{roughness:0.5, metalness:0.35});

    const postW = 0.08;
    const topBeamH = 0.14;

    const transomH = 0.55;
    const transomY0 = H - topBeamH - transomH;

    addBox(g, postW, H, D, -W/2 + postW/2, H/2, 0, frame);
    addBox(g, postW, H, D,  W/2 - postW/2, H/2, 0, frame);

    addBox(g, W, topBeamH, D, 0, H - topBeamH/2, 0, frame);
    addBox(g, W-0.12, 0.05, D+0.02, 0, H - 0.03, 0.01, rail);

    const transomGlass = new THREE.Mesh(new THREE.BoxGeometry(W - postW*2 - 0.04, transomH, 0.04), M.glass);
    transomGlass.position.set(0, transomY0 + transomH/2, D/2 - 0.03);
    transomGlass.castShadow = true; transomGlass.receiveShadow = true;
    g.add(transomGlass);

    addBox(g, W - postW*2 - 0.02, 0.03, D, 0, transomY0, 0, stileMat);

    const panelH = transomY0 - 0.02;
    const panelW = (W/2) - 0.10;
    const panelT = 0.04;

    const left  = new THREE.Mesh(new THREE.BoxGeometry(panelW, panelH, panelT), M.glass);
    const right = new THREE.Mesh(new THREE.BoxGeometry(panelW, panelH, panelT), M.glass);

    const closedX = (panelW/2) + 0.02;
    const y = panelH/2;

    left.position.set(-closedX, y, D/2 - 0.03);
    right.position.set( closedX, y, D/2 - 0.03);

    left.castShadow = true; left.receiveShadow = true;
    right.castShadow = true; right.receiveShadow = true;

    const stileW = 0.03;
    const stileL = new THREE.Mesh(new THREE.BoxGeometry(stileW, panelH, 0.02), stileMat);
    const stileR = new THREE.Mesh(new THREE.BoxGeometry(stileW, panelH, 0.02), stileMat);
    stileL.position.set(panelW/2 - stileW/2, 0, 0);
    stileR.position.set(-panelW/2 + stileW/2, 0, 0);
    left.add(stileL);
    right.add(stileR);

    addBox(left,  0.04, 0.55, 0.02,  panelW/2 - 0.08, 0, 0.03, handleMat);
    addBox(right, 0.04, 0.55, 0.02, -panelW/2 + 0.08, 0, 0.03, handleMat);

    g.add(left);
    g.add(right);

    addBox(g, 0.22, 0.08, 0.10, 0, H - 0.12, D/2 - 0.02, mat(0x1f2937,{roughness:0.6}));

    const slide = Math.max(0.42, (W/2) - 0.16);

    const passThr = (def.door && typeof def.door.passOpenThreshold === "number") ? def.door.passOpenThreshold : 0.72;
    const range   = (def.door && typeof def.door.range === "number") ? def.door.range : 2.8;
    const speed   = (def.door && typeof def.door.speed === "number") ? def.door.speed : 7.0;

    g.userData._door = {
      type: "slide",
      left, right,
      open: 0,
      target: 0,
      speed,
      range,
      slide,
      passOpenThreshold: passThr,
      closedLX: left.position.x,
      closedRX: right.position.x
    };

    return g;
  }

  function makeTallWindow(def){
    const g = new THREE.Group();
    const W = def.size[0], H = def.size[1], D = def.size[2];

    const frame = mat(0xcfd5dd,{roughness:0.35, metalness:0.55});
    const stileMat = mat(0x9aa3ad,{roughness:0.45, metalness:0.55});
    const postW = 0.08;
    const topBeamH = 0.14;

    const transomH = 0.55;
    const transomY0 = H - topBeamH - transomH;

    addBox(g, postW, H, D, -W/2 + postW/2, H/2, 0, frame);
    addBox(g, postW, H, D,  W/2 - postW/2, H/2, 0, frame);

    addBox(g, W, topBeamH, D, 0, H - topBeamH/2, 0, frame);

    const transomGlass = new THREE.Mesh(new THREE.BoxGeometry(W - postW*2 - 0.04, transomH, 0.04), M.glass);
    transomGlass.position.set(0, transomY0 + transomH/2, D/2 - 0.03);
    transomGlass.castShadow = true; transomGlass.receiveShadow = true;
    g.add(transomGlass);

    addBox(g, W - postW*2 - 0.02, 0.03, D, 0, transomY0, 0, stileMat);

    const mainH = transomY0 - 0.02;
    const mainGlass = new THREE.Mesh(new THREE.BoxGeometry(W - postW*2 - 0.04, mainH, 0.04), M.glass);
    mainGlass.position.set(0, mainH/2, D/2 - 0.03);
    mainGlass.castShadow = true; mainGlass.receiveShadow = true;
    g.add(mainGlass);

    return g;
  }

  function createFurnitureMesh(id){
    const def = FURN_BY_ID[id];
    if(!def) return new THREE.Group();

    switch(id){
      case "cashier_counter": return makeCashierCounter(def);
      case "aisle_shelf":     return makeAisleShelf(def);
      case "fridge_wall":     return makeFridgeWall(def);
      case "pallet":          return makePallet(def);
      case "produce_stand":   return makeProduceStand(def);

      case "sliding_door_single":
      case "sliding_door_wide":
      case "glass_sliding_door":
        return makeSlidingDoorEntrance(def);

      case "window_tall_1":
      case "window_tall_2":
        return makeTallWindow(def);

      default: return new THREE.Group();
    }
  }

  // -------------------------
  // AUTO DOOR API (generic)
  // -------------------------
  function updateAutoDoor(doorGroup, playerPos, dt){
    const d = doorGroup.userData && doorGroup.userData._door;
    if(!d) return;

    const cx = doorGroup.position.x;
    const cz = doorGroup.position.z;
    const dx = playerPos.x - cx;
    const dz = playerPos.z - cz;
    const dist = Math.hypot(dx, dz);

    const range = (typeof d.range === "number") ? d.range : 2.8;
    d.target = dist < range ? 1 : 0;

    const k = (typeof d.speed === "number") ? d.speed : 7.0;
    d.open += (d.target - d.open) * (1 - Math.exp(-k * dt));

    const t = d.open;

    if(d.type === "slide" && d.left && d.right){
      const slide = (typeof d.slide === "number") ? d.slide : 0.8;

      const closedLX = (typeof d.closedLX === "number") ? d.closedLX : d.left.position.x;
      const closedRX = (typeof d.closedRX === "number") ? d.closedRX : d.right.position.x;

      d.left.position.x  = closedLX  - t * slide;
      d.right.position.x = closedRX  + t * slide;
    }
  }

  function getAutoDoorOpen(doorGroup){
    const d = doorGroup.userData && doorGroup.userData._door;
    return d ? d.open : 0;
  }

  function getAutoDoorPassThreshold(doorGroup){
    const d = doorGroup.userData && doorGroup.userData._door;
    if(!d) return 0.72;
    return (typeof d.passOpenThreshold === "number") ? d.passOpenThreshold : 0.72;
  }

  function listDoorIds(){
    const out = [];
    for(const f of FURNITURE){
      if(f && f.isDoor) out.push(f.id);
    }
    out.push("glass_sliding_door");
    return out;
  }

  window.Catalog = {
    PRODUCTS,
    FURNITURE,
    FURN_BY_ID,
    createFurnitureMesh,

    updateAutoDoor,
    getAutoDoorOpen,
    getAutoDoorPassThreshold,
    listDoorIds,

    _M: M,
    _OPENING_H: OPENING_H,
    _FLOOR_TOP: FLOOR_TOP
  };
})();
