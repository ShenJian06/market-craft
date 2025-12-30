// build.js — Minecraft-like grid build/break + ghost preview + furniture placement (UPDATED v4.3)
// ✅ Separate FLOOR layer (can exist under doors/windows/furniture)
// ✅ Auto-add floor under doors/windows/furniture footprint (FREE, no inventory cost)
// ✅ Block doors are SLIDING auto-open when you approach (not hinged)  ✅ FIXED (better distance + hysteresis)
// ✅ Colliders are compound AABBs per-mesh (shape-ish) for ALL placed objects
// ✅ Glass blocks hide shared internal faces (only outer faces visible) ✅ FIXED (DoubleSide + depthWrite=false so faces don't vanish)
// ✅ FIXED: Raycast can hit glass from BOTH sides (so you can stack glass / place on underside etc.)
// ✅ FIXED: Player collision with placed objects (implements builder.getColliderAABBAt used by main.js)
// ✅ FIXED: Can place GLASS on/next-to GLASS (backface hit normals are corrected)
// ✅ UPDATED: Furniture auto-doors now work for ANY Catalog furniture with isDoor:true (not only legacy id)
// Exposes: window.Builder
(function(){
  "use strict";

  function key(x,y,z){ return `${x}|${y}|${z}`; }
  function floorKey(x,y,z){ return `${x}|${y}|${z}|floor`; }
  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }

  // Block definitions (1m grid)
  const BlockTypes = {
    floor:  { id:"floor",  size:[1,0.10,1], yOffset:0.05, solid:true,  collide:false, kind:"block" },
    wall:   { id:"wall",   size:[1,1,1],    yOffset:0.5,  solid:true,  collide:true,  kind:"block" },
    slab:   { id:"slab",   size:[1,0.5,1],  yOffset:0.25, solid:true,  collide:true,  kind:"block" },

    glass:  { id:"glass",  size:[1,1,1],    yOffset:0.5,  solid:true,  collide:true,  kind:"glass" },
    window: { id:"window", size:[1,1,0.2],  yOffset:0.5,  solid:true,  collide:true,  kind:"glass_thin" },

    // sliding door block
    door:   { id:"door",   size:[1,2,0.2],  yOffset:1.0,  solid:true,  collide:true,  kind:"door_slide" }
  };

  // NOTE: For transparent objects, depthWrite=true can make faces "disappear" depending on draw order.
  // Fix: DoubleSide + depthWrite=false.
  const Mats = {
    floor: new THREE.MeshStandardMaterial({ color:0xd7c49d, roughness:0.95 }),
    wall:  new THREE.MeshStandardMaterial({ color:0xd97a3b, roughness:0.9  }),
    slab:  new THREE.MeshStandardMaterial({ color:0xa07a55, roughness:0.92 }),

    glass: new THREE.MeshStandardMaterial({
      color:0x9be7ff,
      roughness:0.12,
      metalness:0.05,
      transparent:true,
      opacity:0.28,
      side: THREE.DoubleSide,
      depthWrite:false
    }),
    windowGlass: new THREE.MeshStandardMaterial({
      color:0x9be7ff,
      roughness:0.10,
      metalness:0.05,
      transparent:true,
      opacity:0.22,
      side: THREE.DoubleSide,
      depthWrite:false
    }),

    door: new THREE.MeshStandardMaterial({ color:0xf2b857, roughness:0.8 }),

    ghostOk: new THREE.MeshStandardMaterial({
      color:0x33ffb4, emissive:0x33ffb4, emissiveIntensity:0.7,
      transparent:true, opacity:0.22, roughness:0.35, depthWrite:false,
      side: THREE.DoubleSide
    }),
    ghostBad: new THREE.MeshStandardMaterial({
      color:0xff5c5c, emissive:0xff5c5c, emissiveIntensity:0.65,
      transparent:true, opacity:0.20, roughness:0.35, depthWrite:false,
      side: THREE.DoubleSide
    })
  };

  function buildCulledBox(size, faces){
    const sx=size[0], sy=size[1], sz=size[2];
    const hx=sx/2, hy=sy/2, hz=sz/2;
    const pos=[], nor=[], uv=[], idx=[];
    let vi=0;

    function pushFace(a,b,c,d, n){
      const uvs=[[0,0],[1,0],[1,1],[0,1]];
      const verts=[a,b,c,d];
      for(let i=0;i<4;i++){
        pos.push(verts[i][0],verts[i][1],verts[i][2]);
        nor.push(n[0],n[1],n[2]);
        uv.push(uvs[i][0],uvs[i][1]);
      }
      idx.push(vi+0,vi+1,vi+2, vi+0,vi+2,vi+3);
      vi += 4;
    }

    if(faces.px) pushFace([ hx,-hy,-hz],[ hx,-hy, hz],[ hx, hy, hz],[ hx, hy,-hz],[ 1,0,0]);
    if(faces.nx) pushFace([-hx,-hy, hz],[-hx,-hy,-hz],[-hx, hy,-hz],[-hx, hy, hz],[-1,0,0]);
    if(faces.py) pushFace([-hx, hy,-hz],[ hx, hy,-hz],[ hx, hy, hz],[-hx, hy, hz],[0,1,0]);
    if(faces.ny) pushFace([-hx,-hy, hz],[ hx,-hy, hz],[ hx,-hy,-hz],[-hx,-hy,-hz],[0,-1,0]);
    if(faces.pz) pushFace([ hx,-hy, hz],[-hx,-hy, hz],[-hx, hy, hz],[ hx, hy, hz],[0,0,1]);
    if(faces.nz) pushFace([-hx,-hy,-hz],[ hx,-hy,-hz],[ hx, hy,-hz],[-hx, hy,-hz],[0,0,-1]);

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos,3));
    g.setAttribute("normal",   new THREE.Float32BufferAttribute(nor,3));
    g.setAttribute("uv",       new THREE.Float32BufferAttribute(uv,2));
    g.setIndex(idx);
    g.computeBoundingBox();
    return g;
  }

  function makeBlockMesh(typeId){
    const t = BlockTypes[typeId];

    // ✅ Sliding door block
    if(t.kind === "door_slide"){
      const g = new THREE.Group();

      const leaf = new THREE.Mesh(
        new THREE.BoxGeometry(t.size[0], t.size[1], t.size[2]),
        Mats.door
      );
      leaf.castShadow = true; leaf.receiveShadow = true;

      // centered in the group; we slide leaf along local +X
      leaf.position.set(0, 0, 0);
      g.add(leaf);

      g.userData._slideDoor = {
        leaf,
        open: 0,
        target: 0,
        dist: 0.88,   // slide distance (local units)
        speed: 10.0,  // snappier
        _state: 0     // hysteresis helper
      };
      return g;
    }

    if(t.kind === "glass"){
      // start with all faces visible; will be rebuilt after placement
      const geo = buildCulledBox(t.size, {px:true,nx:true,py:true,ny:true,pz:true,nz:true});
      const m = new THREE.Mesh(geo, Mats.glass);
      m.castShadow = true; m.receiveShadow = true;
      return m;
    }

    if(t.kind === "glass_thin"){
      const m = new THREE.Mesh(new THREE.BoxGeometry(t.size[0], t.size[1], t.size[2]), Mats.windowGlass);
      m.castShadow = true; m.receiveShadow = true;
      return m;
    }

    let mat;
    if(t.id === "floor") mat = Mats.floor;
    else if(t.id === "slab") mat = Mats.slab;
    else mat = Mats.wall;

    const m = new THREE.Mesh(new THREE.BoxGeometry(t.size[0], t.size[1], t.size[2]), mat);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }

  function applyGhostMaterial(root, mat){
    root.traverse(o=>{
      if(!o.isMesh) return;
      o.material = mat;
      o.castShadow = false;
      o.receiveShadow = false;
      o.renderOrder = 999;
      if(o.material){
        o.material.transparent = true;
        o.material.depthWrite = false;
        o.material.side = THREE.DoubleSide; // ✅ so ghost doesn't "lose" faces
      }
    });
  }

  function setGhostValid(ghostRoot, valid){
    applyGhostMaterial(ghostRoot, valid ? Mats.ghostOk : Mats.ghostBad);
  }

  // --- footprint helpers
  function rotToQuarter(rotY){
    return (Math.round((rotY % (Math.PI*2)) / (Math.PI/2)) & 3);
  }

  function getFootprintDims(def, rotY){
    const w = (def.footprint && def.footprint[0]) ? def.footprint[0] : Math.max(1, Math.round(def.size[0] || 1));
    const d = (def.footprint && def.footprint[1]) ? def.footprint[1] : Math.max(1, Math.round(def.size[2] || 1));
    const r = rotToQuarter(rotY);
    const fw = (r % 2 === 0) ? w : d;
    const fd = (r % 2 === 0) ? d : w;
    return { fw, fd, r, w, d };
  }

  // --- colliders (compound AABBs)
  function boxToPlain(b){
    return { min:{x:b.min.x,y:b.min.y,z:b.min.z}, max:{x:b.max.x,y:b.max.y,z:b.max.z} };
  }

  // Builds many small AABBs (per-mesh) -> “shape-ish” collision
  function buildCompoundAABBsFromObject(obj){
    const out = [];
    obj.updateWorldMatrix(true,true);
    const tmp = new THREE.Box3();

    obj.traverse(o=>{
      if(!o.isMesh || !o.geometry) return;
      const g = o.geometry;
      if(!g.boundingBox) g.computeBoundingBox();
      tmp.copy(g.boundingBox).applyMatrix4(o.matrixWorld);

      // skip degenerate
      if(!isFinite(tmp.min.x) || !isFinite(tmp.max.x)) return;
      if(tmp.max.x - tmp.min.x < 1e-6) return;
      if(tmp.max.y - tmp.min.y < 1e-6) return;
      if(tmp.max.z - tmp.min.z < 1e-6) return;

      out.push(boxToPlain(tmp.clone()));
    });

    if(!out.length){
      const bb = new THREE.Box3().setFromObject(obj);
      if(isFinite(bb.min.x)) out.push(boxToPlain(bb));
    }
    return out;
  }

  function create({ scene, camera, worldMeshes, inventory, parcel }){
    const maxY = (parcel.maxY ?? 24);

    // ✅ separate layers:
    const solids = new Map(); // blocks/furniture occupancy & colliders
    const floors = new Map(); // floor-only occupancy (can coexist with solids)

    const placed = new Map(); // refKey -> instance
    const collidersByRef = new Map();

    const group = new THREE.Group();
    scene.add(group);

    const raycaster = new THREE.Raycaster();

    // Grid visuals
    const gridSizeX = (parcel.maxX - parcel.minX + 1);
    const gridSizeZ = (parcel.maxZ - parcel.minZ + 1);
    const gridSize = Math.max(gridSizeX, gridSizeZ);

    const grid = new THREE.GridHelper(gridSize, gridSize, 0x2dd4ff, 0x2dd4ff);
    grid.material.transparent = true;
    grid.material.opacity = 0.18;
    grid.position.set((parcel.minX+parcel.maxX+1)/2, 0.01, (parcel.minZ+parcel.maxZ+1)/2);
    scene.add(grid);

    const boundGeo = new THREE.BoxGeometry(gridSizeX, 0.12, gridSizeZ);
    const boundMat = new THREE.MeshStandardMaterial({ color:0x2dd4ff, transparent:true, opacity:0.06 });
    const bound = new THREE.Mesh(boundGeo, boundMat);
    bound.position.copy(grid.position);
    scene.add(bound);

    let buildMode = false;
    let rotIndex = 0;

    // --- Ghost (real model, not cube)
    const ghostRoot = new THREE.Group();
    ghostRoot.visible = false;
    scene.add(ghostRoot);

    let ghostModel = null;
    let ghostKey = "";

    function rebuildGhostForSelected(){
      const item = inventory.getSelectedItem();
      const k = item.kind + "|" + item.id;
      if(k === ghostKey) return;
      ghostKey = k;

      if(ghostModel){
        ghostRoot.remove(ghostModel);
        // NOTE: avoid disposing Catalog shared geometries if your Catalog reuses them
        ghostModel.traverse(o=>{ if(o.isMesh && o.geometry) o.geometry.dispose(); });
        ghostModel = null;
      }

      if(item.kind === "block") ghostModel = makeBlockMesh(item.id);
      else ghostModel = window.Catalog.createFurnitureMesh(item.id);

      applyGhostMaterial(ghostModel, Mats.ghostOk);
      ghostRoot.add(ghostModel);
    }

    function setBuildMode(on){
      buildMode = !!on;
      grid.visible = buildMode;
      bound.visible = buildMode;
      ghostRoot.visible = buildMode;
    }

    function cellInParcel(gx,gz){
      return gx >= parcel.minX && gx <= parcel.maxX && gz >= parcel.minZ && gz <= parcel.maxZ;
    }

    function getSolidCell(gx,gy,gz){ return solids.get(key(gx,gy,gz)) || null; }
    function isSolidAt(gx,gy,gz){ return solids.has(key(gx,gy,gz)); }
    function isFloorAt(gx,gy,gz){ return floors.has(key(gx,gy,gz)); }

    function hasColliderAt(gx,gy,gz){
      const c = getSolidCell(gx,gy,gz);
      return !!(c && c.collide);
    }

    function markCells(refKey, cells, meta){
      const isFloor = (meta.typeId === "floor");
      for(const c of cells){
        const k = key(c.gx,c.gy,c.gz);
        const rec = { refKey, type:c.type, typeId:meta.typeId, collide:!!meta.collide };
        if(isFloor) floors.set(k, rec);
        else solids.set(k, rec);
      }
    }

    function unmarkCells(cells, metaTypeId){
      const isFloor = (metaTypeId === "floor");
      for(const c of cells){
        const k = key(c.gx,c.gy,c.gz);
        if(isFloor) floors.delete(k);
        else solids.delete(k);
      }
    }

    // Support: ground OR neighbor support (include floors too)
    function computeSupportOK(gx,gy,gz){
      if(gy === 0) return true;

      const support = [
        key(gx,gy-1,gz),
        key(gx+1,gy,gz),
        key(gx-1,gy,gz),
        key(gx,gy,gz+1),
        key(gx,gy,gz-1),
      ];
      for(const k of support){
        if(solids.has(k) || floors.has(k)) return true;
      }
      return false;
    }

    function canPlaceBlock(typeId, gx,gy,gz){
      if(!cellInParcel(gx,gz)) return false;
      if(gy < 0 || gy >= maxY) return false;

      if(typeId === "floor"){
        if(isFloorAt(gx,gy,gz)) return false;
        return computeSupportOK(gx,gy,gz);
      }

      if(isSolidAt(gx,gy,gz)) return false;
      return computeSupportOK(gx,gy,gz);
    }

    // --- Glass face culling (only on solids)
    function isGlassAt(gx,gy,gz){
      const c = getSolidCell(gx,gy,gz);
      return !!(c && c.typeId === "glass");
    }

    function rebuildGlassAt(gx,gy,gz){
      const ref = key(gx,gy,gz);
      const inst = placed.get(ref);
      if(!inst || inst.kind !== "block" || inst.id !== "glass") return;

      const faces = {
        px: !isGlassAt(gx+1,gy,gz),
        nx: !isGlassAt(gx-1,gy,gz),
        py: !isGlassAt(gx,gy+1,gz),
        ny: !isGlassAt(gx,gy-1,gz),
        pz: !isGlassAt(gx,gy,gz+1),
        nz: !isGlassAt(gx,gy,gz-1),
      };

      const t = BlockTypes.glass;
      const geo = buildCulledBox(t.size, faces);

      if(inst.obj.geometry){
        inst.obj.geometry.dispose();
        inst.obj.geometry = geo;
        // collider extents unchanged (still 1x1x1), so no need to refresh colliders here
      }
    }

    function rebuildGlassNeighbors(gx,gy,gz){
      rebuildGlassAt(gx,gy,gz);
      rebuildGlassAt(gx+1,gy,gz);
      rebuildGlassAt(gx-1,gy,gz);
      rebuildGlassAt(gx,gy+1,gz);
      rebuildGlassAt(gx,gy-1,gz);
      rebuildGlassAt(gx,gy,gz+1);
      rebuildGlassAt(gx,gy,gz-1);
    }

    // --- colliders refresh
    function refreshCollidersFor(refKey){
      const inst = placed.get(refKey);
      if(!inst){ collidersByRef.delete(refKey); return; }

      // floor => no colliders
      if(inst.kind === "block" && inst.id === "floor"){
        collidersByRef.set(refKey, []);
        return;
      }

      // if cells collide false => no colliders
      let anyCollide = false;
      for(const c of inst.cells){
        const cell = solids.get(key(c.gx,c.gy,c.gz));
        if(cell && cell.collide){ anyCollide = true; break; }
      }
      if(!anyCollide){ collidersByRef.set(refKey, []); return; }

      collidersByRef.set(refKey, buildCompoundAABBsFromObject(inst.obj));
    }

    function getColliders(){
      const out = [];
      for(const [refKey, arr] of collidersByRef.entries()){
        if(!arr || !arr.length) continue;
        const inst = placed.get(refKey);
        if(!inst) continue;
        for(const b of arr){
          out.push({ refKey, kind:inst.kind, id:inst.id, min:b.min, max:b.max });
        }
      }
      return out;
    }

    // ✅ IMPORTANT: main.js uses builder.getColliderAABBAt(gx,gy,gz)
    // We return minY/maxY of colliders that overlap THIS (gx,gz) column and THIS y-slice [gy,gy+1].
    function getColliderAABBAt(gx,gy,gz){
      const rec = solids.get(key(gx,gy,gz));
      if(!rec || !rec.collide) return null;

      const refKey = rec.refKey;
      const arr = collidersByRef.get(refKey);

      // Fallback: solid full voxel if no compound data yet
      if(!arr || !arr.length){
        return { minY: gy, maxY: gy + 1 };
      }

      const x0 = gx, x1 = gx + 1;
      const y0 = gy, y1 = gy + 1;
      const z0 = gz, z1 = gz + 1;

      let minY = Infinity;
      let maxY = -Infinity;

      for(const b of arr){
        // overlap in XZ
        if(b.max.x <= x0 || b.min.x >= x1) continue;
        if(b.max.z <= z0 || b.min.z >= z1) continue;
        // overlap in this y slice
        if(b.max.y <= y0 || b.min.y >= y1) continue;

        const aMin = Math.max(b.min.y, y0);
        const aMax = Math.min(b.max.y, y1);
        if(aMax <= aMin) continue;

        if(aMin < minY) minY = aMin;
        if(aMax > maxY) maxY = aMax;
      }

      if(!isFinite(minY) || !isFinite(maxY) || maxY <= minY) return null;
      return { minY, maxY };
    }

    // ✅ FREE auto-floor (does NOT consume inventory)
    function ensureAutoFloorAt(gx,gy,gz){
      if(!cellInParcel(gx,gz)) return false;
      if(gy < 0 || gy >= maxY) return false;
      if(isFloorAt(gx,gy,gz)) return true;

      const t = BlockTypes.floor;
      const obj = makeBlockMesh("floor");
      obj.position.set(gx+0.5, gy + t.yOffset, gz+0.5);
      obj.rotation.y = 0;

      const refKey = floorKey(gx,gy,gz);

      obj.traverse(o=>{
        if(!o.isMesh) return;
        o.userData.isPlaced = true;
        o.userData.refKey = refKey;
        o.userData.kind = "block";
        o.userData.typeId = "floor";
        o.userData.autoFloor = true;
        o.userData.gx = gx; o.userData.gy = gy; o.userData.gz = gz;
      });

      group.add(obj);

      const cells = [{ gx,gy,gz, type:"block" }];
      placed.set(refKey, { kind:"block", id:"floor", obj, cells, rotY:0, gx,gy,gz, autoFloor:true });
      markCells(refKey, cells, { typeId:"floor", collide:false });

      refreshCollidersFor(refKey);
      return true;
    }

    function ensureAutoFloorsFootprint(gx,gy,gz, fw,fd){
      for(let x=0;x<fw;x++){
        for(let z=0;z<fd;z++){
          ensureAutoFloorAt(gx+x, gy, gz+z);
        }
      }
    }

    function placeBlock(typeId, gx,gy,gz, rotY=0){
      if(!canPlaceBlock(typeId,gx,gy,gz)) return false;
      if((inventory.counts[typeId]||0) <= 0) return false;

      // ✅ auto-floor under door/window (same cell, same gy)
      if(typeId === "door" || typeId === "window"){
        ensureAutoFloorAt(gx,gy,gz);
      }

      const t = BlockTypes[typeId];
      const obj = makeBlockMesh(typeId);

      obj.position.set(gx+0.5, gy + t.yOffset, gz+0.5);
      obj.rotation.y = rotY;

      const refKey = (typeId === "floor") ? floorKey(gx,gy,gz) : key(gx,gy,gz);

      // IMPORTANT: mark meshes as placed for ray break
      obj.traverse(o=>{
        if(!o.isMesh) return;
        o.userData.isPlaced = true;
        o.userData.refKey = refKey;
        o.userData.kind = "block";
        o.userData.typeId = typeId;
        o.userData.gx = gx; o.userData.gy = gy; o.userData.gz = gz;
      });

      group.add(obj);

      const cells = [{ gx,gy,gz, type:"block" }];
      placed.set(refKey, { kind:"block", id:typeId, obj, cells, rotY, gx,gy,gz });
      markCells(refKey, cells, { typeId, collide: !!t.collide });

      inventory.counts[typeId]--;

      // ✅ glass internal faces hidden between glass blocks
      if(typeId === "glass") rebuildGlassNeighbors(gx,gy,gz);

      refreshCollidersFor(refKey);
      return true;
    }

    function canPlaceFurniture(furnId, gx,gy,gz, rotY){
      const def = window.Catalog.FURN_BY_ID[furnId];
      if(!def) return false;

      if(!cellInParcel(gx,gz)) return false;
      if(gy < 0 || gy >= maxY) return false;

      const { fw, fd } = getFootprintDims(def, rotY);

      for(let x=0;x<fw;x++){
        for(let z=0;z<fd;z++){
          const cx = gx + x;
          const cz = gz + z;
          if(!cellInParcel(cx,cz)) return false;

          const hCells = Math.max(1, Math.ceil(def.size[1] || 1));
          for(let y=0;y<hCells;y++){
            const cy = gy + y;
            if(isSolidAt(cx,cy,cz)) return false;
          }

          // require support under if elevated (support can be solid OR floor)
          if(gy > 0 && !(solids.has(key(cx, gy-1, cz)) || floors.has(key(cx, gy-1, cz)))) return false;
        }
      }
      return true;
    }

    function placeFurniture(furnId, gx,gy,gz, rotY){
      const def = window.Catalog.FURN_BY_ID[furnId];
      if(!def) return false;
      if(!canPlaceFurniture(furnId,gx,gy,gz,rotY)) return false;
      if((inventory.counts[furnId]||0) <= 0) return false;

      const { fw, fd, r } = getFootprintDims(def, rotY);

      // ✅ auto-floor under entire footprint (FREE)
      ensureAutoFloorsFootprint(gx,gy,gz, fw,fd);

      const refKey = key(gx,gy,gz) + "|f|" + furnId + "|r|" + r;

      const model = window.Catalog.createFurnitureMesh(furnId);

      const yOff = (def.yOffset || 0);
      model.position.set(gx + fw/2, gy + yOff, gz + fd/2);
      model.rotation.y = rotY;

      model.traverse(o=>{
        if(!o.isMesh) return;
        o.userData.isPlaced = true;
        o.userData.refKey = refKey;
        o.userData.kind = "furniture";
        o.userData.typeId = furnId;
        o.userData.gx = gx; o.userData.gy = gy; o.userData.gz = gz;

        // also ensure transparent furniture (if any) doesn't self-occlude
        if(o.material && o.material.transparent){
          o.material.depthWrite = false;
          o.material.side = THREE.DoubleSide;
        }
      });

      group.add(model);

      const hCells = Math.max(1, Math.ceil(def.size[1] || 1));
      const cells = [];
      for(let x=0;x<fw;x++){
        for(let z=0;z<fd;z++){
          for(let y=0;y<hCells;y++){
            cells.push({ gx:gx+x, gy:gy+y, gz:gz+z, type:"furniture" });
          }
        }
      }

      placed.set(refKey, { kind:"furniture", id:furnId, obj:model, cells, rotY, def, gx,gy,gz, fw,fd,hCells });
      markCells(refKey, cells, { typeId:furnId, collide:true });

      inventory.counts[furnId]--;

      refreshCollidersFor(refKey);
      return true;
    }

    function breakByRefKey(refKey){
      const inst = placed.get(refKey);
      if(!inst) return false;

      let glassPos = null;
      if(inst.kind === "block" && inst.id === "glass"){
        glassPos = { gx: inst.gx, gy: inst.gy, gz: inst.gz };
      }

      // ✅ unmark from correct layer
      const metaTypeId = inst.id;
      unmarkCells(inst.cells, metaTypeId);

      placed.delete(refKey);
      group.remove(inst.obj);
      collidersByRef.delete(refKey);

      if(inst.obj){
        inst.obj.traverse(o=>{ if(o.isMesh && o.geometry) o.geometry.dispose(); });
      }

      // refund inventory (auto-floors do NOT refund / do NOT cost)
      if(!(inst.kind === "block" && inst.id === "floor" && inst.autoFloor)){
        const id = inst.id;
        inventory.counts[id] = (inventory.counts[id]||0) + 1;
      }

      if(glassPos) rebuildGlassNeighbors(glassPos.gx, glassPos.gy, glassPos.gz);
      return true;
    }

    function getIntersections(){
      raycaster.setFromCamera({x:0, y:0}, camera);
      const targets = [];
      if(worldMeshes && worldMeshes.length) targets.push(...worldMeshes);
      group.traverse(o=>{ if(o.isMesh) targets.push(o); });
      return raycaster.intersectObjects(targets, false);
    }

    // ✅ FIXED: correct placement normal even on backface hits (DoubleSide glass)
    function pickPlacementNormalFromHit(h){
      // default up if no face
      const n = (h && h.face ? h.face.normal.clone() : new THREE.Vector3(0,1,0));

      // to world space
      if(h && h.object) n.transformDirection(h.object.matrixWorld);

      // IMPORTANT: Raycaster does NOT flip face.normal for backface hits.
      // If the normal points in the same direction as the ray, we hit the "back" side -> flip it.
      // This is what fixes: can't place glass on glass / underside placements.
      if(raycaster && raycaster.ray && raycaster.ray.direction){
        if(n.dot(raycaster.ray.direction) > 0) n.multiplyScalar(-1);
      }

      // snap to dominant axis (keeps it grid-clean)
      const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
      if(ay >= ax && ay >= az) return new THREE.Vector3(0, Math.sign(n.y)||1, 0);
      if(ax >= az)            return new THREE.Vector3(Math.sign(n.x)||1, 0, 0);
      return new THREE.Vector3(0, 0, Math.sign(n.z)||1);
    }

    // ---- GHOST UPDATE (no tremble)
    let ghostCell = { gx:0, gy:0, gz:0, valid:false, rotY:0 };

    const groundPlane = new THREE.Plane(new THREE.Vector3(0,1,0), 0);
    const tmpP = new THREE.Vector3();

    function updateGhost(){
      if(!buildMode) return;

      rebuildGhostForSelected();

      const item = inventory.getSelectedItem();
      const rotY = (rotIndex % 4) * (Math.PI/2);

      // Furniture = always snap by ray -> ground plane (stable, no jitter)
      if(item.kind === "furniture"){
        raycaster.setFromCamera({x:0,y:0}, camera);
        const hit = raycaster.ray.intersectPlane(groundPlane, tmpP);
        if(!hit){
          ghostRoot.visible = false;
          ghostCell.valid = false;
          return;
        }

        let gx = Math.floor(tmpP.x + 1e-6);
        let gz = Math.floor(tmpP.z + 1e-6);
        gx = clamp(gx, parcel.minX, parcel.maxX);
        gz = clamp(gz, parcel.minZ, parcel.maxZ);

        const def = window.Catalog.FURN_BY_ID[item.id];
        const { fw, fd } = getFootprintDims(def, rotY);

        gx = clamp(gx, parcel.minX, parcel.maxX - (fw-1));
        gz = clamp(gz, parcel.minZ, parcel.maxZ - (fd-1));

        const gy = 0;

        const valid = canPlaceFurniture(item.id, gx,gy,gz, rotY);
        setGhostValid(ghostModel, valid);

        ghostRoot.position.set(gx + fw/2, gy + (def.yOffset||0), gz + fd/2);
        ghostRoot.rotation.y = rotY;

        ghostRoot.visible = true;
        ghostCell = { gx,gy,gz, valid, rotY };
        return;
      }

      // Blocks = use mesh hits (Minecraft-ish)
      const hits = getIntersections();
      if(!hits.length){
        ghostRoot.visible = false;
        ghostCell.valid = false;
        return;
      }

      const h = hits[0];
      const p = h.point;

      let gx = Math.floor(p.x + 1e-4);
      let gz = Math.floor(p.z + 1e-4);
      let gy = 0;

      if(h.object && h.object.userData && h.object.userData.isPlaced){
        // ✅ FIX: use corrected normal (works on glass backfaces / DoubleSide)
        const n = pickPlacementNormalFromHit(h);

        // push into the adjacent cell in the chosen direction
        gx = Math.floor(p.x + n.x * 0.5);
        gz = Math.floor(p.z + n.z * 0.5);
        gy = Math.floor(p.y + n.y * 0.5);
      }

      gx = clamp(gx, parcel.minX, parcel.maxX);
      gz = clamp(gz, parcel.minZ, parcel.maxZ);
      gy = clamp(gy, 0, maxY-1);

      const valid = canPlaceBlock(item.id, gx,gy,gz);
      setGhostValid(ghostModel, valid);

      const t = BlockTypes[item.id] || BlockTypes.wall;
      ghostRoot.position.set(gx+0.5, gy + t.yOffset, gz+0.5);
      ghostRoot.rotation.y = rotY;

      ghostRoot.visible = true;
      ghostCell = { gx,gy,gz, valid, rotY };
    }

    function tryPlace(){
      if(!buildMode) return false;
      if(!ghostCell.valid) return false;
      const item = inventory.getSelectedItem();
      const rotY = ghostCell.rotY;

      if(item.kind === "block") return placeBlock(item.id, ghostCell.gx, ghostCell.gy, ghostCell.gz, rotY);
      return placeFurniture(item.id, ghostCell.gx, ghostCell.gy, ghostCell.gz, rotY);
    }

    function tryBreak(){
      if(!buildMode) return false;
      const hits = getIntersections();
      if(!hits.length) return false;
      const h = hits[0];
      if(h.object && h.object.userData && h.object.userData.isPlaced){
        return breakByRefKey(h.object.userData.refKey);
      }
      return false;
    }

    function rotateLeft(){ rotIndex = (rotIndex + 3) % 4; }
    function rotateRight(){ rotIndex = (rotIndex + 1) % 4; }

    function updateDynamic(playerPos, dt){
      for(const [refKey, inst] of placed.entries()){
        // ✅ Furniture auto doors: ANY isDoor:true (Catalog v5.1)
        if(inst.kind === "furniture"){
          const def = inst.def || (window.Catalog && window.Catalog.FURN_BY_ID && window.Catalog.FURN_BY_ID[inst.id]) || null;
          const isDoor = !!(def && def.isDoor);

          if(isDoor && window.Catalog && window.Catalog.updateAutoDoor){
            window.Catalog.updateAutoDoor(inst.obj, playerPos, dt);

            // toggle collision when open enough (threshold from Catalog helper if present)
            const open = (window.Catalog.getAutoDoorOpen) ? window.Catalog.getAutoDoorOpen(inst.obj) : ((inst.obj.userData && inst.obj.userData._door) ? inst.obj.userData._door.open : 0);
            const thr  = (window.Catalog.getAutoDoorPassThreshold) ? window.Catalog.getAutoDoorPassThreshold(inst.obj) : ((inst.obj.userData && inst.obj.userData._door && typeof inst.obj.userData._door.passOpenThreshold === "number") ? inst.obj.userData._door.passOpenThreshold : 0.72);

            const pass = open > thr;
            for(const c of inst.cells){
              const cell = solids.get(key(c.gx,c.gy,c.gz));
              if(cell) cell.collide = !pass;
            }
            refreshCollidersFor(refKey);
          }
          continue;
        }

        // ✅ sliding BLOCK door auto-open (FIXED)
        if(inst.kind === "block" && inst.id === "door"){
          const sd = inst.obj.userData && inst.obj.userData._slideDoor;
          if(!sd) continue;

          // planar distance (XZ) to door center
          const cx = inst.gx + 0.5;
          const cz = inst.gz + 0.5;
          const dx = playerPos.x - cx;
          const dz = playerPos.z - cz;
          const dist = Math.hypot(dx, dz);

          // Hysteresis so it doesn't flicker: open when near, close when farther
          const OPEN_R  = 1.45;
          const CLOSE_R = 1.75;
          if(sd._state === 0){
            if(dist < OPEN_R) sd._state = 1;
          }else{
            if(dist > CLOSE_R) sd._state = 0;
          }
          sd.target = sd._state ? 1 : 0;

          const prev = sd.open;
          sd.open += (sd.target - sd.open) * (1 - Math.exp(-sd.speed * dt));

          // slide leaf along local +X
          sd.leaf.position.x = sd.open * sd.dist;

          // collision toggles when open enough
          const cell = solids.get(key(inst.gx, inst.gy, inst.gz));
          if(cell) cell.collide = (sd.open < 0.70);

          // refresh colliders only if changed noticeably
          if(Math.abs(sd.open - prev) > 0.0015){
            refreshCollidersFor(refKey);
          }
        }
      }
    }

    function hasSolidAt(gx,gy,gz){ return solids.has(key(gx,gy,gz)); }

    return {
      BlockTypes,
      setBuildMode,
      get buildMode(){ return buildMode; },

      updateGhost,
      tryPlace,
      tryBreak,
      rotateLeft,
      rotateRight,

      hasSolidAt,          // solids only (floors excluded)
      hasColliderAt,       // collision only
      getColliders,        // compound AABBs for “shape-ish” collisions (optional use)
      getColliderAABBAt,   // ✅ REQUIRED by main.js for player collision
      updateDynamic,
      group
    };
  }

  window.Builder = { create };
})();
