// catalog.js — products + furniture registry (low poly)
// Exposes: window.Catalog

(function(){
  "use strict";

  // Simple product list (future: stocking, pricing, tags)
  const PRODUCTS = [
    { id:"water",        name:"Water",        price:1.29, category:"Drinks" },
    { id:"soda",         name:"Soda",         price:1.99, category:"Drinks" },
    { id:"chips",        name:"Chips",        price:2.49, category:"Snacks" },
    { id:"cereal",       name:"Cereal",       price:3.99, category:"Food" },
    { id:"cat_food",     name:"Cat Food",     price:5.49, category:"Pets" },
    { id:"minced_meat",  name:"Minced Meat",  price:6.99, category:"Food" },
  ];

  // Helper for low-poly materials (no color variants)
  function mat(color, opts={}){
    return new THREE.MeshStandardMaterial(Object.assign({
      color,
      roughness: 0.9,
      metalness: 0.0
    }, opts));
  }

  const M = {
    metal: mat(0x6b7280, { roughness:0.75, metalness:0.15 }),
    white: mat(0xe5e7eb, { roughness:0.92 }),
    dark:  mat(0x111827, { roughness:0.65 }),
    red:   mat(0xef4444, { roughness:0.85 }),
    blue:  mat(0x2563eb, { roughness:0.85 }),
    wood:  mat(0xb7794a, { roughness:0.95 }),
    sand:  mat(0xd7c49d, { roughness:0.95 }),
    green: mat(0x22c55e, { roughness:0.92 }),
    glass: new THREE.MeshStandardMaterial({
      color:0x9be7ff, roughness:0.12, metalness:0.05,
      transparent:true, opacity:0.28
    }),
    neonG: new THREE.MeshStandardMaterial({
      color:0x33ffb4, emissive:0x33ffb4, emissiveIntensity:0.6,
      transparent:true, opacity:0.22, roughness:0.3
    })
  };

  // Furniture definitions (sizes in meters, footprint in grid cells)
  const FURNITURE = [
    {
      id:"cashier_counter",
      name:"Counter",
      icon:"🧾",
      size:[3.0, 1.05, 1.2],
      yOffset:0.0,
      footprint:[3,2],
      solid:true
    },
    {
      id:"aisle_shelf",
      name:"Shelf",
      icon:"🗄️",
      size:[1.2, 2.2, 0.55],
      yOffset:0.0,
      footprint:[2,1],
      solid:true
    },
    {
      id:"fridge_wall",
      name:"Fridge",
      icon:"🧊",
      size:[3.0, 2.2, 0.85],
      yOffset:0.0,
      footprint:[3,1],
      solid:true
    },
    {
      id:"pallet",
      name:"Pallet",
      icon:"📦",
      size:[1.2, 0.22, 1.0],
      yOffset:0.0,
      footprint:[2,2],
      solid:true
    },
    {
      id:"produce_stand",
      name:"Produce",
      icon:"🥦",
      size:[1.25, 1.65, 0.95],
      yOffset:0.0,
      footprint:[2,2],
      solid:true
    },
    {
      id:"glass_sliding_door",
      name:"Glass Door",
      icon:"🚪",
      size:[2.0, 2.2, 0.22],
      yOffset:0.0,
      footprint:[2,1],
      solid:true,
      isDoor:true
    }
  ];

  const FURN_BY_ID = Object.create(null);
  for(const f of FURNITURE) FURN_BY_ID[f.id] = f;

  function addBox(g, w,h,d, x,y,z, material){
    const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), material);
    m.position.set(x,y,z);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  }

  function makeCashierCounter(){
    const g = new THREE.Group();
    // base
    addBox(g, 3.0, 0.95, 1.2, 0, 0.475, 0, mat(0xd1a2b8, { roughness:0.92 }));
    // top surface
    addBox(g, 3.05, 0.08, 1.25, 0, 0.95, 0, mat(0xede9fe, { roughness:0.65 }));
    // register block
    addBox(g, 0.40, 0.18, 0.30, -1.05, 1.05, -0.20, M.dark);
    // screen
    addBox(g, 0.28, 0.22, 0.06, -1.02, 1.22, -0.33, mat(0x0b1022, { roughness:0.4 }));
    // scanner
    addBox(g, 0.22, 0.08, 0.22, -0.55, 1.02, -0.12, mat(0x1f2937, { roughness:0.7 }));
    // stool (simple)
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.06,0.55,8), M.metal);
    leg.position.set(1.1, 0.275, -0.65);
    leg.castShadow = true; leg.receiveShadow = true;
    g.add(leg);
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.22,0.08,10), mat(0x374151,{roughness:0.9}));
    seat.position.set(1.1, 0.61, -0.65);
    seat.castShadow = true; seat.receiveShadow = true;
    g.add(seat);
    return g;
  }

  function makeAisleShelf(){
    const g = new THREE.Group();
    // side panels
    addBox(g, 0.06, 2.2, 0.55, -0.57, 1.10, 0, M.white);
    addBox(g, 0.06, 2.2, 0.55,  0.57, 1.10, 0, M.white);
    // back spine
    addBox(g, 1.14, 2.2, 0.06, 0, 1.10, -0.245, M.white);
    // shelves
    const shelfMat = mat(0xf3f4f6, { roughness:0.95 });
    for(let i=0;i<5;i++){
      addBox(g, 1.14, 0.06, 0.52, 0, 0.26 + i*0.44, 0.04, shelfMat);
    }
    // kick plate
    addBox(g, 1.14, 0.10, 0.55, 0, 0.05, 0, mat(0xd1d5db, { roughness:0.95 }));
    return g;
  }

  function makeFridgeWall(){
    const g = new THREE.Group();
    // body
    addBox(g, 3.0, 2.2, 0.85, 0, 1.10, 0, mat(0xe5e7eb, { roughness:0.9 }));
    // inner cavity (dark inset)
    addBox(g, 2.86, 1.95, 0.55, 0, 1.12, 0.12, mat(0x111827, { roughness:0.9 }));
    // glass front
    const glass = addBox(g, 2.92, 2.0, 0.08, 0, 1.10, 0.40, M.glass);
    glass.material.opacity = 0.24;
    // shelves inside
    const shelfMat = mat(0x9ca3af, { roughness:0.85, metalness:0.05 });
    for(let i=0;i<4;i++){
      addBox(g, 2.74, 0.04, 0.44, 0, 0.55 + i*0.40, 0.10, shelfMat);
    }
    // red ends (like the reference)
    addBox(g, 0.08, 2.2, 0.85, -1.46, 1.10, 0, mat(0xef4444, { roughness:0.85 }));
    addBox(g, 0.08, 2.2, 0.85,  1.46, 1.10, 0, mat(0xef4444, { roughness:0.85 }));
    return g;
  }

  function makePallet(){
    const g = new THREE.Group();
    const wood = mat(0xb97a4f, { roughness:0.95 });

    // bottom runners
    addBox(g, 1.18, 0.06, 0.12, 0, 0.03, -0.38, wood);
    addBox(g, 1.18, 0.06, 0.12, 0, 0.03,  0.00, wood);
    addBox(g, 1.18, 0.06, 0.12, 0, 0.03,  0.38, wood);

    // blocks
    for(const x of [-0.50, 0, 0.50]){
      for(const z of [-0.38, 0.0, 0.38]){
        addBox(g, 0.12, 0.10, 0.12, x, 0.11, z, wood);
      }
    }

    // top slats
    for(let i=0;i<7;i++){
      addBox(g, 1.18, 0.04, 0.10, 0, 0.18, -0.40 + i*0.13, wood);
    }

    return g;
  }

  function makeProduceStand(){
    const g = new THREE.Group();
    const frame = mat(0x111827, { roughness:0.8, metalness:0.15 });
    const tray = mat(0x1f2937, { roughness:0.85 });

    // base frame
    addBox(g, 1.25, 0.08, 0.95, 0, 0.04, 0, frame);
    addBox(g, 0.08, 1.55, 0.08, -0.58, 0.78, -0.40, frame);
    addBox(g, 0.08, 1.55, 0.08,  0.58, 0.78, -0.40, frame);
    addBox(g, 0.08, 1.30, 0.08, -0.58, 0.65,  0.40, frame);
    addBox(g, 0.08, 1.30, 0.08,  0.58, 0.65,  0.40, frame);

    // angled trays (3 levels)
    const levels = [
      { y:0.55, z:0.20, rot:-0.22, w:1.14, d:0.62 },
      { y:0.95, z:0.06, rot:-0.22, w:1.14, d:0.62 },
      { y:1.35, z:-0.08, rot:-0.22, w:1.14, d:0.62 },
    ];
    for(const L of levels){
      const t = new THREE.Mesh(new THREE.BoxGeometry(L.w, 0.06, L.d), tray);
      t.position.set(0, L.y, L.z);
      t.rotation.x = L.rot;
      t.castShadow = true; t.receiveShadow = true;
      g.add(t);

      // low poly "produce" blobs (fixed colors)
      const colors = [0x22c55e, 0xf97316, 0xeab308, 0xef4444];
      for(let i=0;i<8;i++){
        const p = new THREE.Mesh(new THREE.SphereGeometry(0.08, 7, 6), mat(colors[i % colors.length], { roughness:0.95 }));
        p.position.set(-0.48 + (i%4)*0.32, L.y+0.10, L.z + (i<4 ? -0.05 : 0.18));
        p.castShadow = true;
        g.add(p);
      }
    }

    // small top sign
    addBox(g, 1.05, 0.12, 0.08, 0, 1.60, -0.42, mat(0x111827,{roughness:0.7}));
    return g;
  }

  function makeGlassSlidingDoor(){
    const g = new THREE.Group();

    // frame
    addBox(g, 2.0, 2.2, 0.08, 0, 1.10, 0, mat(0x9ca3af, { roughness:0.75, metalness:0.15 }));
    // opening (inner)
    const inner = new THREE.Mesh(new THREE.BoxGeometry(1.92, 2.05, 0.06), mat(0x111827,{roughness:0.95}));
    inner.position.set(0, 1.08, 0.01);
    inner.castShadow = false;
    inner.receiveShadow = true;
    g.add(inner);

    // panels
    const left = new THREE.Mesh(new THREE.BoxGeometry(0.95, 2.0, 0.04), M.glass);
    const right = new THREE.Mesh(new THREE.BoxGeometry(0.95, 2.0, 0.04), M.glass);
    left.position.set(-0.48, 1.08, 0.05);
    right.position.set(0.48, 1.08, 0.05);
    left.castShadow = false; right.castShadow = false;
    left.receiveShadow = true; right.receiveShadow = true;
    g.add(left); g.add(right);

    // subtle handles
    addBox(g, 0.08, 0.55, 0.03, -0.10, 1.02, 0.085, mat(0x6b7280,{roughness:0.5, metalness:0.35}));
    addBox(g, 0.08, 0.55, 0.03,  0.10, 1.02, 0.085, mat(0x6b7280,{roughness:0.5, metalness:0.35}));

    // Auto-slide behavior fields
    g.userData._door = {
      left, right,
      open: 0,
      speed: 5.5,
      range: 2.4, // meters trigger radius
      slide: 0.46 // how far each panel slides
    };

    return g;
  }

  function createFurnitureMesh(id){
    switch(id){
      case "cashier_counter": return makeCashierCounter();
      case "aisle_shelf": return makeAisleShelf();
      case "fridge_wall": return makeFridgeWall();
      case "pallet": return makePallet();
      case "produce_stand": return makeProduceStand();
      case "glass_sliding_door": return makeGlassSlidingDoor();
      default: return new THREE.Group();
    }
  }

  // Door update helper (works for placed & world doors)
  function updateAutoDoor(doorGroup, playerPos, dt){
    const d = doorGroup.userData && doorGroup.userData._door;
    if(!d) return;
    const cx = doorGroup.position.x;
    const cy = doorGroup.position.y + 1.0;
    const cz = doorGroup.position.z;
    const dist = Math.hypot(playerPos.x - cx, (playerPos.y-1.0) - cy, playerPos.z - cz);
    const target = dist < d.range ? 1 : 0;
    d.open += (target - d.open) * Math.min(1, dt * d.speed);
    const t = d.open;

    // slide panels sideways in local space
    d.left.position.x  = -0.48 - t * d.slide;
    d.right.position.x =  0.48 + t * d.slide;
  }

  window.Catalog = {
    PRODUCTS,
    FURNITURE,
    FURN_BY_ID,
    createFurnitureMesh,
    updateAutoDoor
  };
})();
