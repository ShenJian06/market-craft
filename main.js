// main.js — boots renderer, player FPS, build mode, interactions (UPDATED v3.1)
// ✅ FIX: collision now uses Builder.getColliders() compound AABBs (slabs/furniture heights OK)
// ✅ FIX: placed sliding doors (furniture + block door) now auto-open visually AND become passable
// ✅ Keeps: camera-relative WASD (yaw only), stable movement
(function(){
  "use strict";

  const canvas   = document.getElementById("c");
  const blocker  = document.getElementById("blocker");
  const startBtn = document.getElementById("startBtn");

  // Renderer
  const renderer = new THREE.WebGLRenderer({ canvas, antialias:true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.shadowMap.enabled = true;

  // Scene + camera
  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(72, window.innerWidth/window.innerHeight, 0.05, 260);
  camera.position.set(2.5, 1.75, 4.5);

  // World
  const world = window.World.create(scene);

  // Parcel (expands on upgrades)
  const parcel = { minX:-10, maxX:10, minZ:-10, maxZ:10, maxY:16 };

  // Inventory + UI
  const inventory = window.Inventory.create({
    startMoney: 250,
    plotUpgrades: [
      { id:"plot_1", cost: 500,  expand:{ x:2, z:2 } },
      { id:"plot_2", cost: 1200, expand:{ x:3, z:3 } },
      { id:"plot_3", cost: 2500, expand:{ x:4, z:4 } },
      { id:"plot_4", cost: 5000, expand:{ x:6, z:6 } },
    ]
  });

  // If Catalog loaded after inventory, keep list in sync
  if(inventory.refreshFromCatalog) inventory.refreshFromCatalog();

  const ui = window.UI.create({ inventory });

  // Raycast targets: static world meshes (exclude placed)
  const worldRayTargets = [];
  function rebuildWorldRayTargets(){
    worldRayTargets.length = 0;
    scene.traverse(obj => {
      if(obj.isMesh && !obj.userData.isPlaced){
        worldRayTargets.push(obj);
      }
    });
  }
  rebuildWorldRayTargets();

  // Builder
  const builder = window.Builder.create({
    scene,
    camera,
    worldMeshes: worldRayTargets,
    inventory,
    parcel
  });

  // Optional: world sliding door demo (use NON-legacy id)
  const worldDoors = [];
  (function addWorldDoor(){
    if(!window.Catalog || !window.Catalog.createFurnitureMesh) return;
    const door = window.Catalog.createFurnitureMesh("sliding_door_single");
    door.position.set(10, 0.01, 8);
    door.rotation.y = Math.PI;
    door.traverse(o=>{ if(o.isMesh){ o.userData.isPlaced = false; } });
    scene.add(door);
    worldDoors.push(door);
    rebuildWorldRayTargets();
  })();

  // Player controller
  const state = {
    locked:false,
    buildMode:false,
    yaw:0,
    pitch:0,
    vel: new THREE.Vector3(),
    pos: new THREE.Vector3(2.5, 2.2, 4.5),
    grounded:false,

    speed: 6.4,
    sprint: 9.0,
    gravity: 18.5,
    jump: 6.8
  };

  const keys = Object.create(null);
  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }

  function lock(){ canvas.requestPointerLock(); }

  document.addEventListener("pointerlockchange", () => {
    state.locked = (document.pointerLockElement === canvas);
    blocker.classList.toggle("hidden", state.locked);
  });

  startBtn.addEventListener("click", () => lock());
  blocker.addEventListener("click", () => lock());

  window.addEventListener("resize", () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  function applyPlotUpgrade(up){
    if(!up || !up.expand) return;
    const ex = up.expand.x|0;
    const ez = up.expand.z|0;
    parcel.minX -= ex; parcel.maxX += ex;
    parcel.minZ -= ez; parcel.maxZ += ez;
    ui.showToast(`Plot expanded! (-${ex}/+${ex}, -${ez}/+${ez})`, 1200);
  }

  // -------------------------------
  // Door helpers (placed objects)
  // -------------------------------
  // Map refKey -> {open, th}
  function getDoorPassMap(){
    const map = new Map();
    if(!builder || !builder.group) return map;

    builder.group.traverse(obj=>{
      // Furniture doors created by Catalog have userData._door on the root group
      if(obj.userData && obj.userData._door && window.Catalog){
        let refKey = null;
        obj.traverse(c=>{
          if(refKey) return;
          if(c.userData && c.userData.isPlaced && c.userData.refKey) refKey = c.userData.refKey;
        });
        if(refKey){
          const open = window.Catalog.getAutoDoorOpen ? window.Catalog.getAutoDoorOpen(obj) : (obj.userData._door.open||0);
          const th   = window.Catalog.getAutoDoorPassThreshold ? window.Catalog.getAutoDoorPassThreshold(obj) : 0.72;
          map.set(refKey, { open, th });
        }
      }

      // Block door from Builder has userData._slideDoor on the root group
      if(obj.userData && obj.userData._slideDoor){
        let refKey = null;
        obj.traverse(c=>{
          if(refKey) return;
          if(c.userData && c.userData.isPlaced && c.userData.refKey) refKey = c.userData.refKey;
        });
        if(refKey){
          const open = obj.userData._slideDoor.open || 0;
          map.set(refKey, { open, th: 0.78 });
        }
      }
    });

    return map;
  }

  // Update doors visually (even if Builder doesn't special-case new ids)
  function updatePlacedDoors(dt){
    if(!builder || !builder.group) return;

    builder.group.traverse(obj=>{
      // Furniture door animation (Catalog generic API)
      if(obj.userData && obj.userData._door && window.Catalog && window.Catalog.updateAutoDoor){
        window.Catalog.updateAutoDoor(obj, state.pos, dt);
      }

      // Block door slide animation (same behavior as Builder)
      if(obj.userData && obj.userData._slideDoor){
        const sd = obj.userData._slideDoor;

        const cx = obj.position.x;
        const cz = obj.position.z;
        const dist = Math.hypot(state.pos.x - cx, state.pos.z - cz);

        sd.target = (dist < 1.10) ? 1 : 0;
        sd.open += (sd.target - sd.open) * (1 - Math.exp(-sd.speed * dt));

        if(sd.leaf) sd.leaf.position.x = sd.open * sd.dist;
      }
    });
  }

  // Inputs
  window.addEventListener("keydown", (e) => {
    keys[e.code] = true;

    if(e.code === "KeyB"){
      state.buildMode = !state.buildMode;
      builder.setBuildMode(state.buildMode);
      ui.setMode(state.buildMode);
      ui.showToast(state.buildMode ? "Build mode ON" : "Build mode OFF");
    }

    if(e.code === "KeyR"){
      state.pos.set(2.5, 2.2, 4.5);
      state.vel.set(0,0,0);
      ui.showToast("Reset position");
    }

    if(e.code === "KeyU"){
      const next = inventory.getNextPlotUpgrade();
      if(!next){
        ui.showToast("No more plot upgrades.", 1200);
      } else if(!inventory.canAffordPlotUpgrade()){
        ui.showToast(`Need $${next.cost.toFixed(0)} (you have $${inventory.getMoney().toFixed(0)})`, 1400);
      } else {
        const bought = inventory.buyNextPlotUpgrade();
        if(bought){
          applyPlotUpgrade(bought);
          ui.showToast(`Bought ${bought.id} for $${bought.cost}`, 1200);
        }
      }
    }

    if(e.code.startsWith("Digit")){
      const d = e.code.slice(5);
      const slot = (d === "0") ? 9 : (parseInt(d,10)-1);
      if(slot >= 0 && slot < inventory.pageSize){
        const ok = inventory.setSelectedInPage(slot);
        if(ok){
          const it = inventory.getSelectedItem();
          ui.showToast(`Selected: ${it.name}`);
        }
      }
    }

    if(e.code === "KeyQ") builder.rotateLeft();
    if(e.code === "KeyE") builder.rotateRight();
  });

  window.addEventListener("keyup", (e) => { keys[e.code] = false; });

  window.addEventListener("wheel", (e) => {
    if(!state.locked) return;
    inventory.cycle(e.deltaY > 0 ? 1 : -1);
    const it = inventory.getSelectedItem();
    ui.showToast(`Selected: ${it.name}`, 700);
  }, { passive:true });

  window.addEventListener("mousemove", (e) => {
    if(!state.locked) return;
    const mx = e.movementX || 0;
    const my = e.movementY || 0;
    state.yaw   -= mx * 0.0022;
    state.pitch -= my * 0.0020;
    state.pitch = clamp(state.pitch, -1.45, 1.45);
  });

  window.addEventListener("mousedown", (e) => {
    if(!state.locked) return;
    if(state.buildMode){
      if(e.button === 0){
        const ok = builder.tryPlace();
        ui.showToast(ok ? "Placed" : "Can't place here", 650);
      }
      if(e.button === 2){
        const ok = builder.tryBreak();
        if(ok) ui.showToast("Broken + added to inventory", 850);
      }
    }
  });
  window.addEventListener("contextmenu", (e) => e.preventDefault());

  // -----------------------------------------
  // Physics: collisions via compound AABBs
  // -----------------------------------------
  function resolveAABBCollisions(allCols, doorPassMap){
    const radius = 0.28;
    const height = 1.70;

    state.grounded = false;

    // Recompute player AABB helper
    function playerAABB(){
      return {
        minX: state.pos.x - radius,
        maxX: state.pos.x + radius,
        minY: state.pos.y - height,
        maxY: state.pos.y,
        minZ: state.pos.z - radius,
        maxZ: state.pos.z + radius
      };
    }

    // Iterate a couple times for stability
    for(let iter=0; iter<2; iter++){
      let p = playerAABB();

      for(const c of allCols){
        // Doors: become passable when open enough
        if(c.refKey && doorPassMap && doorPassMap.has(c.refKey)){
          const dp = doorPassMap.get(c.refKey);
          if(dp && (dp.open >= dp.th)) continue;
        }

        const min = c.min, max = c.max;

        if(p.maxX <= min.x || p.minX >= max.x) continue;
        if(p.maxY <= min.y || p.minY >= max.y) continue;
        if(p.maxZ <= min.z || p.minZ >= max.z) continue;

        const ox1 = max.x - p.minX;
        const ox2 = p.maxX - min.x;
        const oy1 = max.y - p.minY;
        const oy2 = p.maxY - min.y;
        const oz1 = max.z - p.minZ;
        const oz2 = p.maxZ - min.z;

        const penX = Math.min(ox1, ox2);
        const penY = Math.min(oy1, oy2);
        const penZ = Math.min(oz1, oz2);

        if(penY <= penX && penY <= penZ){
          // If we're above the collider center -> push up, else push down
          const cMidY = (min.y + max.y) * 0.5;
          if(state.pos.y > cMidY){
            state.pos.y += penY + 0.001;
            state.vel.y = Math.max(0, state.vel.y);
            state.grounded = true;
          } else {
            state.pos.y -= penY + 0.001;
            state.vel.y = Math.min(0, state.vel.y);
          }
        } else if(penX <= penZ){
          const cMidX = (min.x + max.x) * 0.5;
          state.pos.x += (state.pos.x > cMidX) ? (penX + 0.001) : (-penX - 0.001);
          state.vel.x *= 0.2;
        } else {
          const cMidZ = (min.z + max.z) * 0.5;
          state.pos.z += (state.pos.z > cMidZ) ? (penZ + 0.001) : (-penZ - 0.001);
          state.vel.z *= 0.2;
        }

        p = playerAABB();
      }
    }

    // Ground plane at y=0
    const floorY = 0.0;
    const pyFeet = state.pos.y - height;
    if(pyFeet < floorY){
      state.pos.y = floorY + height;
      if(state.vel.y < 0) state.vel.y = 0;
      state.grounded = true;
    }
  }

  function resolveCollisions(){
    const bcolsRaw = (builder && builder.getColliders) ? builder.getColliders() : [];
    const wcolsRaw = (world && world.getColliders) ? world.getColliders() : [];

    // Door pass map (based on actual open value)
    const doorPassMap = getDoorPassMap();

    const all = [];

    // builder compound boxes are already world-space mins/maxes
    for(const b of bcolsRaw){
      all.push({
        refKey: b.refKey,
        min: b.min,
        max: b.max
      });
    }

    // world boxes
    for(const w of wcolsRaw){
      all.push({
        refKey: null,
        min: w.min,
        max: w.max
      });
    }

    resolveAABBCollisions(all, doorPassMap);
  }

  // Loop
  let lastT = performance.now();
  const UP = new THREE.Vector3(0,1,0);
  function tick(){
    const now = performance.now();
    let dt = (now - lastT) / 1000;
    lastT = now;
    dt = Math.min(0.033, dt);

    if(world && world.update) world.update(dt);

    if(state.locked){
      builder.updateGhost();

      // Minecraft-like: forward/right from yaw only
      const forward = new THREE.Vector3(0,0,-1).applyAxisAngle(UP, state.yaw);
      const right   = new THREE.Vector3(1,0,0).applyAxisAngle(UP, state.yaw);

      const wish = new THREE.Vector3();
      if(keys["KeyW"]) wish.add(forward);
      if(keys["KeyS"]) wish.addScaledVector(forward, -1);
      if(keys["KeyA"]) wish.addScaledVector(right, -1);
      if(keys["KeyD"]) wish.add(right);

      if(wish.lengthSq() > 0) wish.normalize();

      const maxSpd = (keys["ShiftLeft"] || keys["ShiftRight"]) ? state.sprint : state.speed;
      const accel  = state.grounded ? 34 : 14;

      state.vel.x += wish.x * accel * dt;
      state.vel.z += wish.z * accel * dt;

      const fr = state.grounded ? 14 : 3;
      state.vel.x -= state.vel.x * fr * dt;
      state.vel.z -= state.vel.z * fr * dt;

      const hs = Math.hypot(state.vel.x, state.vel.z);
      if(hs > maxSpd){
        const s = maxSpd / hs;
        state.vel.x *= s; state.vel.z *= s;
      }

      if(keys["Space"] && state.grounded){
        state.vel.y = state.jump;
        state.grounded = false;
      }

      state.vel.y -= state.gravity * dt;

      state.pos.x += state.vel.x * dt;
      state.pos.y += state.vel.y * dt;
      state.pos.z += state.vel.z * dt;

      // ✅ doors update (visual + passability map)
      updatePlacedDoors(dt);

      // collision resolve (builder + world)
      resolveCollisions();

      camera.rotation.order = "YXZ";
      camera.rotation.y = state.yaw;
      camera.rotation.x = state.pitch;
      camera.position.copy(state.pos);

      // keep Builder dynamic (still useful for other things)
      if(builder.updateDynamic) builder.updateDynamic(state.pos, dt);

      // world demo door
      for(const d of worldDoors){
        if(window.Catalog && window.Catalog.updateAutoDoor) window.Catalog.updateAutoDoor(d, state.pos, dt);
      }

      const wb = 110;
      state.pos.x = clamp(state.pos.x, -wb, wb);
      state.pos.z = clamp(state.pos.z, -wb, wb);
      state.pos.y = clamp(state.pos.y, 0.8, 60);
    }

    ui.tick();
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }

  ui.setMode(false);
  builder.setBuildMode(false);
  tick();
})();
