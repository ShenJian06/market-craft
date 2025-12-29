// build.js — Minecraft-like grid build/break + ghost preview + furniture placement
// Exposes: window.Builder

(function(){
  "use strict";

  function key(x,y,z){ return `${x}|${y}|${z}`; }
  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }

  // Block definitions in meters (grid unit = 1m)
  const BlockTypes = {
    floor:  { id:"floor",  size:[1,0.10,1], yOffset:0.05, solid:true,  kind:"block" },
    wall:   { id:"wall",   size:[1,1,1],    yOffset:0.5,  solid:true,  kind:"block" },
    slab:   { id:"slab",   size:[1,0.5,1],  yOffset:0.25, solid:true,  kind:"block" },
    glass:  { id:"glass",  size:[1,1,1],    yOffset:0.5,  solid:true,  kind:"glass" },
    window: { id:"window", size:[1,1,0.2],  yOffset:0.5,  solid:true,  kind:"glass" },
    door:   { id:"door",   size:[1,2,0.2],  yOffset:1.0,  solid:true,  kind:"door"  }
  };

  function makeBlockMesh(typeId){
    const t = BlockTypes[typeId];
    const geo = new THREE.BoxGeometry(t.size[0], t.size[1], t.size[2]);

    let mat;
    if(t.kind === "glass"){
      mat = new THREE.MeshStandardMaterial({
        color:0x9be7ff, roughness:0.12, metalness:0.05,
        transparent:true, opacity:0.28
      });
    } else if(t.kind === "door"){
      mat = new THREE.MeshStandardMaterial({ color:0xf2b857, roughness:0.8 });
    } else if(t.id === "floor"){
      mat = new THREE.MeshStandardMaterial({ color:0xd7c49d, roughness:0.95 });
    } else {
      mat = new THREE.MeshStandardMaterial({ color:0xd97a3b, roughness:0.9 });
    }
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  function makeGhostMesh(){
    const geo = new THREE.BoxGeometry(1,1,1);
    const mat = new THREE.MeshStandardMaterial({
      color:0x33ffb4, emissive:0x33ffb4, emissiveIntensity:0.6,
      transparent:true, opacity:0.22, roughness:0.3
    });
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = false;
    m.receiveShadow = false;
    m.renderOrder = 999;
    return m;
  }

  function setGhostValid(ghost, valid){
    const mat = ghost.material;
    if(valid){
      mat.color.setHex(0x33ffb4);
      mat.emissive.setHex(0x33ffb4);
      mat.opacity = 0.22;
    }else{
      mat.color.setHex(0xff5c5c);
      mat.emissive.setHex(0xff5c5c);
      mat.opacity = 0.20;
    }
    mat.needsUpdate = true;
  }

  function create({ scene, camera, worldMeshes, inventory, parcel }){
    // voxel occupancy for collision + placement checks (1m grid cells)
    const solids = new Map(); // key-> { refKey, type:"block"|"furniture" }
    const placed = new Map(); // refKey -> instance { kind, id, group/mesh, aabb, cells[], door? }

    const group = new THREE.Group();
    scene.add(group);

    const ghost = makeGhostMesh();
    ghost.visible = false;
    scene.add(ghost);

    const raycaster = new THREE.Raycaster();

    // Grid helper visible only in build mode
    const gridSizeX = (parcel.maxX - parcel.minX + 1);
    const gridSizeZ = (parcel.maxZ - parcel.minZ + 1);
    const gridSize = Math.max(gridSizeX, gridSizeZ);
    const grid = new THREE.GridHelper(gridSize, gridSize, 0x2dd4ff, 0x2dd4ff);
    grid.material.transparent = true;
    grid.material.opacity = 0.18;
    grid.position.set((parcel.minX+parcel.maxX+1)/2, 0.01, (parcel.minZ+parcel.maxZ+1)/2);
    scene.add(grid);

    // Parcel boundary
    const boundGeo = new THREE.BoxGeometry(gridSizeX, 0.12, gridSizeZ);
    const boundMat = new THREE.MeshStandardMaterial({ color:0x2dd4ff, transparent:true, opacity:0.06 });
    const bound = new THREE.Mesh(boundGeo, boundMat);
    bound.position.copy(grid.position);
    scene.add(bound);

    let buildMode = false;
    let rotIndex = 0; // 0..3, rotates 90deg around Y

    function setBuildMode(on){
      buildMode = !!on;
      grid.visible = buildMode;
      bound.visible = buildMode;
      ghost.visible = buildMode;
    }

    function cellInParcel(gx,gz){
      return gx >= parcel.minX && gx <= parcel.maxX && gz >= parcel.minZ && gz <= parcel.maxZ;
    }

    function isSolidAt(gx,gy,gz){
      return solids.has(key(gx,gy,gz));
    }

    function markCells(refKey, cells){
      for(const c of cells){
        solids.set(key(c.gx,c.gy,c.gz), { refKey, type:c.type });
      }
    }

    function unmarkCells(cells){
      for(const c of cells){
        solids.delete(key(c.gx,c.gy,c.gz));
      }
    }

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
        if(solids.has(k)) return true;
      }
      return false;
    }

    function canPlaceBlock(typeId, gx,gy,gz){
      if(!cellInParcel(gx,gz)) return false;
      if(gy < 0 || gy > (parcel.maxY||24)) return false;
      if(isSolidAt(gx,gy,gz)) return false;
      return computeSupportOK(gx,gy,gz);
    }

    function placeBlock(typeId, gx,gy,gz, rotY=0){
      if(!canPlaceBlock(typeId,gx,gy,gz)) return false;
      if(inventory.counts[typeId] <= 0) return false;

      const t = BlockTypes[typeId];
      const mesh = makeBlockMesh(typeId);
      mesh.position.set(gx+0.5, gy + t.yOffset, gz+0.5);
      mesh.rotation.y = rotY;

      const refKey = key(gx,gy,gz);
      mesh.userData.isPlaced = true;
      mesh.userData.refKey = refKey;
      mesh.userData.kind = "block";
      mesh.userData.typeId = typeId;

      group.add(mesh);

      const cells = [{ gx,gy,gz, type:"block" }];
      placed.set(refKey, { kind:"block", id:typeId, obj:mesh, cells, rotY });

      markCells(refKey, cells);
      inventory.counts[typeId]--;

      return true;
    }

    function canPlaceFurniture(furnId, gx,gy,gz, rotY){
      const def = window.Catalog.FURN_BY_ID[furnId];
      if(!def) return false;

      // furniture sits on floor by default; allow gy >=0 if supported
      if(!cellInParcel(gx,gz)) return false;
      if(gy < 0 || gy > (parcel.maxY||24)) return false;

      // Determine footprint cells depending on rotation (swap width/depth when rotated 90/270)
      const w = def.footprint[0];
      const d = def.footprint[1];
      const r = Math.round((rotY % (Math.PI*2)) / (Math.PI/2)) & 3;
      const fw = (r % 2 === 0) ? w : d;
      const fd = (r % 2 === 0) ? d : w;

      // Origin anchors at gx,gz (lower-left corner), occupies [gx..gx+fw-1], [gz..gz+fd-1]
      for(let x=0;x<fw;x++){
        for(let z=0;z<fd;z++){
          const cx = gx + x;
          const cz = gz + z;
          if(!cellInParcel(cx,cz)) return false;
          // occupy multiple y cells based on height
          const hCells = Math.max(1, Math.ceil(def.size[1]));
          for(let y=0;y<hCells;y++){
            const cy = gy + y;
            if(isSolidAt(cx,cy,cz)) return false;
          }
          // support: each footprint cell needs support beneath if gy>0
          if(gy > 0){
            if(!solids.has(key(cx, gy-1, cz))) return false;
          }
        }
      }
      // if gy>0, at least supported; if gy==0 ok.
      if(gy > 0) return true;
      // also allow on ground always
      return true;
    }

    function placeFurniture(furnId, gx,gy,gz, rotY){
      const def = window.Catalog.FURN_BY_ID[furnId];
      if(!def) return false;
      if(!canPlaceFurniture(furnId,gx,gy,gz,rotY)) return false;
      if(inventory.counts[furnId] <= 0) return false;

      const refKey = key(gx,gy,gz) + "|f|" + furnId + "|r|" + (Math.round(rotY/(Math.PI/2))&3);
      const model = window.Catalog.createFurnitureMesh(furnId);
      model.position.set(gx + def.size[0]/2, gy, gz + def.size[2]/2);
      model.rotation.y = rotY;

      // Mark all child meshes so raycasting can identify instance
      model.traverse(o=>{
        if(o.isMesh){
          o.userData.isPlaced = true;
          o.userData.refKey = refKey;
          o.userData.kind = "furniture";
          o.userData.typeId = furnId;
        }
      });

      group.add(model);

      // occupancy cells
      const r = Math.round((rotY % (Math.PI*2)) / (Math.PI/2)) & 3;
      const w = def.footprint[0], d = def.footprint[1];
      const fw = (r % 2 === 0) ? w : d;
      const fd = (r % 2 === 0) ? d : w;
      const hCells = Math.max(1, Math.ceil(def.size[1]));

      const cells = [];
      for(let x=0;x<fw;x++){
        for(let z=0;z<fd;z++){
          for(let y=0;y<hCells;y++){
            cells.push({ gx:gx+x, gy:gy+y, gz:gz+z, type:"furniture" });
          }
        }
      }

      placed.set(refKey, { kind:"furniture", id:furnId, obj:model, cells, rotY, def });
      markCells(refKey, cells);

      inventory.counts[furnId]--;
      return true;
    }

    function breakByRefKey(refKey){
      const inst = placed.get(refKey);
      if(!inst) return false;

      unmarkCells(inst.cells);
      placed.delete(refKey);

      group.remove(inst.obj);

      // add back to inventory
      const id = inst.id;
      inventory.counts[id] = (inventory.counts[id]||0) + 1;
      return true;
    }

    function getIntersections(){
      raycaster.setFromCamera({x:0, y:0}, camera);
      const targets = [];
      if(worldMeshes && worldMeshes.length) targets.push(...worldMeshes);
      group.traverse(obj => { if(obj.isMesh) targets.push(obj); });
      return raycaster.intersectObjects(targets, false);
    }

    let ghostCell = { gx:0, gy:0, gz:0, valid:false };

    function getSelectedDef(item){
      if(item.kind === "block"){
        const t = BlockTypes[item.id] || BlockTypes.wall;
        return { kind:"block", id:item.id, size:t.size, yOffset:t.yOffset, can:(gx,gy,gz,rotY)=>canPlaceBlock(item.id,gx,gy,gz), place:(gx,gy,gz,rotY)=>placeBlock(item.id,gx,gy,gz,rotY) };
      } else {
        const def = window.Catalog.FURN_BY_ID[item.id];
        return { kind:"furniture", id:item.id, size:def.size, yOffset:0, can:(gx,gy,gz,rotY)=>canPlaceFurniture(item.id,gx,gy,gz,rotY), place:(gx,gy,gz,rotY)=>placeFurniture(item.id,gx,gy,gz,rotY) };
      }
    }

    function updateGhost(){
      if(!buildMode) return;

      const item = inventory.getSelectedItem();
      const def = getSelectedDef(item);

      // Resize ghost
      ghost.scale.set(def.size[0], def.size[1], def.size[2]);

      const hits = getIntersections();
      if(!hits.length){
        ghost.visible = false;
        ghostCell.valid = false;
        return;
      }
      const hit = hits[0];

      // candidate cell:
      // - If hit placed: offset by face normal
      // - else ground: y=0 snap
      const p = hit.point;
      let gx = Math.floor(p.x + 0.0001);
      let gz = Math.floor(p.z + 0.0001);
      let gy = 0;

      if(hit.object && hit.object.userData && hit.object.userData.isPlaced){
        const ud = hit.object.userData;
        // If we hit a block/furniture, offset by face normal
        const n = hit.face ? hit.face.normal.clone() : new THREE.Vector3(0,1,0);
        n.transformDirection(hit.object.matrixWorld);
        gx = Math.floor(p.x + n.x * 0.5);
        gz = Math.floor(p.z + n.z * 0.5);
        gy = Math.floor(p.y + n.y * 0.5);
      }

      // Clamp parcel & height
      gx = clamp(gx, parcel.minX, parcel.maxX);
      gz = clamp(gz, parcel.minZ, parcel.maxZ);
      gy = clamp(gy, 0, parcel.maxY||24);

      const rotY = (rotIndex % 4) * (Math.PI/2);

      const valid = def.can(gx,gy,gz,rotY);
      setGhostValid(ghost, valid);

      // Position ghost: center on size
      ghost.position.set(gx + def.size[0]/2, gy + def.size[1]/2, gz + def.size[2]/2);
      ghost.rotation.y = rotY;

      ghostCell = { gx,gy,gz, valid, def, rotY };
    }

    function tryPlace(){
      if(!buildMode) return false;
      if(!ghostCell.valid) return false;
      return ghostCell.def.place(ghostCell.gx, ghostCell.gy, ghostCell.gz, ghostCell.rotY);
    }

    function tryBreak(){
      if(!buildMode) return false;
      const hits = getIntersections();
      if(!hits.length) return false;
      const h = hits[0];
      if(h.object && h.object.userData && h.object.userData.isPlaced){
        const refKey = h.object.userData.refKey;
        return breakByRefKey(refKey);
      }
      return false;
    }

    function rotateLeft(){ rotIndex = (rotIndex + 3) % 4; }
    function rotateRight(){ rotIndex = (rotIndex + 1) % 4; }

    // Automatic door updates for placed sliding doors
    function updateDynamic(playerPos, dt){
      for(const inst of placed.values()){
        // update only glass sliding door furniture
        if(inst.kind === "furniture" && inst.id === "glass_sliding_door"){
          window.Catalog.updateAutoDoor(inst.obj, playerPos, dt);
        }
      }
    }

    // Collision query (used by player controller)
    function hasSolidAt(gx,gy,gz){
      return solids.has(key(gx,gy,gz));
    }

    // Starter platform
    for(let x=parcel.minX; x<parcel.minX+6; x++){
      for(let z=parcel.minZ; z<parcel.minZ+6; z++){
        placeBlock("floor", x, 0, z, 0);
      }
    }
    placeBlock("wall", parcel.minX+2, 1, parcel.minZ+2, 0);
    placeBlock("glass", parcel.minX+3, 1, parcel.minZ+2, 0);

    return {
      BlockTypes,
      setBuildMode,
      get buildMode(){ return buildMode; },
      updateGhost,
      tryPlace,
      tryBreak,
      rotateLeft,
      rotateRight,
      hasSolidAt,
      updateDynamic,
      group
    };
  }

  window.Builder = { create };
})();
