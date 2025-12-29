// main.js — boots renderer, player FPS, build mode, interactions (v2)
(function(){
  "use strict";

  const canvas = document.getElementById("c");
  const blocker = document.getElementById("blocker");
  const startBtn = document.getElementById("startBtn");

  // Renderer
  const renderer = new THREE.WebGLRenderer({ canvas, antialias:true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.shadowMap.enabled = true;

  // Scene + camera
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(72, window.innerWidth/window.innerHeight, 0.05, 260);
  camera.position.set(2.5, 1.75, 4.5);

  // Create world
  const world = window.World.create(scene);

  // Parcel: small buildable plot on beach corner
  const parcel = { minX:-10, maxX:10, minZ:-10, maxZ:10, maxY:16 };

  // Inventory + UI
  const inventory = window.Inventory.create();
  const ui = window.UI.create({ inventory });

  // Raycast targets: all static world meshes (exclude placed)
  const worldRayTargets = [];
  scene.traverse(obj => {
    if(obj.isMesh && !obj.userData.isPlaced){
      worldRayTargets.push(obj);
    }
  });

  // Builder
  const builder = window.Builder.create({
    scene,
    camera,
    worldMeshes: worldRayTargets,
    inventory,
    parcel
  });

  // Showcase: a world automatic sliding glass door at the storefront
  const worldDoors = [];
  (function addWorldDoor(){
    const door = window.Catalog.createFurnitureMesh("glass_sliding_door");
    // position near store window as an "entrance"
    door.position.set(24, 0.01, 14.88);
    door.rotation.y = Math.PI; // face street
    // mark meshes as placed=false so builder doesn't break it, but raycast can hit it
    door.traverse(o=>{ if(o.isMesh){ o.userData.isPlaced = false; } });
    scene.add(door);
    worldDoors.push(door);
  })();

  // Simple player controller (pointer lock)
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

  function lock(){
    canvas.requestPointerLock();
  }
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

    // Hotbar 1..0 selects within current page
    if(e.code.startsWith("Digit")){
      const d = e.code.slice(5); // "1".."0"
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

  // Mouse wheel cycles selection (fast for lots of furniture)
  window.addEventListener("wheel", (e) => {
    if(!state.locked) return;
    inventory.cycle(e.deltaY > 0 ? 1 : -1);
    const it = inventory.getSelectedItem();
    ui.showToast(`Selected: ${it.name}`, 800);
  }, { passive:true });

  window.addEventListener("mousemove", (e) => {
    if(!state.locked) return;
    const mx = e.movementX || 0;
    const my = e.movementY || 0;
    state.yaw   -= mx * 0.0022;
    state.pitch -= my * 0.0020;
    state.pitch = clamp(state.pitch, -1.45, 1.45);
  });

  // Mouse actions (build mode only)
  window.addEventListener("mousedown", (e) => {
    if(!state.locked) return;

    if(state.buildMode){
      if(e.button === 0){
        const ok = builder.tryPlace();
        if(ok) ui.showToast("Placed");
        else ui.showToast("Can't place here");
      }
      if(e.button === 2){
        const ok = builder.tryBreak();
        if(ok) ui.showToast("Broken + added to inventory");
      }
    }
  });
  window.addEventListener("contextmenu", (e) => e.preventDefault());

  // Physics: very lightweight voxel collision
  function resolveCollisions(){
    const radius = 0.28;
    const height = 1.70;

    const px = state.pos.x, py = state.pos.y, pz = state.pos.z;
    const minGX = Math.floor(px - 3), maxGX = Math.floor(px + 3);
    const minGZ = Math.floor(pz - 3), maxGZ = Math.floor(pz + 3);

    state.grounded = false;

    for(let gx=minGX; gx<=maxGX; gx++){
      for(let gz=minGZ; gz<=maxGZ; gz++){
        for(let gy=Math.floor(py-2); gy<=Math.floor(py+3); gy++){
          if(!builder.hasSolidAt(gx,gy,gz)) continue;

          const bx0=gx, bx1=gx+1;
          const by0=gy, by1=gy+1;
          const bz0=gz, bz1=gz+1;

          const px0 = px - radius, px1 = px + radius;
          const pz0 = pz - radius, pz1 = pz + radius;
          const py0 = py - height, py1 = py;

          if(px1 <= bx0 || px0 >= bx1 || pz1 <= bz0 || pz0 >= bz1 || py1 <= by0 || py0 >= by1) continue;

          const ox1 = bx1 - px0;
          const ox2 = px1 - bx0;
          const oz1 = bz1 - pz0;
          const oz2 = pz1 - bz0;
          const oy1 = by1 - py0;
          const oy2 = py1 - by0;

          const penX = Math.min(ox1, ox2);
          const penZ = Math.min(oz1, oz2);
          const penY = Math.min(oy1, oy2);

          if(penY <= penX && penY <= penZ){
            if(py1 > by0 && (py1 - by0) < 0.6){
              state.pos.y = by0;
              if(state.vel.y > 0) state.vel.y = 0;
            } else {
              state.pos.y = by1 + height;
              if(state.vel.y < 0) state.vel.y = 0;
              state.grounded = true;
            }
          } else if(penX < penZ){
            if(px > gx + 0.5) state.pos.x += penX + 0.001;
            else state.pos.x -= penX + 0.001;
            state.vel.x *= 0.2;
          } else {
            if(pz > gz + 0.5) state.pos.z += penZ + 0.001;
            else state.pos.z -= penZ + 0.001;
            state.vel.z *= 0.2;
          }
        }
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

  // Loop
  let lastT = performance.now();
  function tick(){
    const now = performance.now();
    let dt = (now - lastT) / 1000;
    lastT = now;
    dt = Math.min(0.033, dt);

    if(state.locked){
      // Update build ghost
      builder.updateGhost();

      // Movement in yaw plane
      const forward = new THREE.Vector3(Math.sin(state.yaw), 0, Math.cos(state.yaw)).normalize().multiplyScalar(-1);
      const right = new THREE.Vector3(forward.z, 0, -forward.x);

      const wish = new THREE.Vector3();
      if(keys["KeyW"]) wish.add(forward);
      if(keys["KeyS"]) wish.addScaledVector(forward, -1);
      if(keys["KeyA"]) wish.addScaledVector(right, -1);
      if(keys["KeyD"]) wish.add(right);

      const moving = wish.lengthSq() > 0;
      if(moving) wish.normalize();

      const maxSpd = (keys["ShiftLeft"] || keys["ShiftRight"]) ? state.sprint : state.speed;
      const accel = state.grounded ? 34 : 14;

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

      resolveCollisions();

      camera.rotation.order = "YXZ";
      camera.rotation.y = state.yaw;
      camera.rotation.x = state.pitch;
      camera.position.copy(state.pos);

      // Update auto doors (placed + world)
      builder.updateDynamic(state.pos, dt);
      for(const d of worldDoors){
        window.Catalog.updateAutoDoor(d, state.pos, dt);
      }

      // Soft world bounds
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
