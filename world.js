// world.js — low-poly beach-town vibe scene (UPDATED: clouds + minecraft-ish trees + colliders)
// Exposes: window.World
//
// ✅ Adds:
// - moving low-poly clouds (world.update(dt))
// - minecraft-style palms (blocky trunk + leaf clumps)
// - colliders for store/buildings/lamps/trees (world.getColliders())
// - marks world meshes as non-placed so Builder can raycast them (but not break them)

(function(){
  "use strict";

  function rand(a,b){ return a + Math.random()*(b-a); }

  // ---------- Colliders ----------
  function v3(x=0,y=0,z=0){ return new THREE.Vector3(x,y,z); }

  function aabbFromBox(pos, size){
    const hx=size.x*0.5, hy=size.y*0.5, hz=size.z*0.5;
    return { min: v3(pos.x-hx, pos.y-hy, pos.z-hz), max: v3(pos.x+hx, pos.y+hy, pos.z+hz) };
  }

  // helper: for meshes with BoxGeometry you control
  function pushBoxCollider(list, worldPos, size){
    list.push(aabbFromBox(worldPos, size));
  }

  // ---------- Minecraft-ish palm ----------
  function makeMinecraftPalm(){
    const g = new THREE.Group();

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x9b6a3a, roughness: 0.92 });
    const leafMat  = new THREE.MeshStandardMaterial({ color: 0x2fbf5b, roughness: 0.92 });

    // trunk: stacked boxes (slight bend)
    const trunkGeo = new THREE.BoxGeometry(0.55, 0.55, 0.55);
    const steps = 6 + (Math.random()*3|0);
    let ox = rand(-0.10,0.10), oz = rand(-0.10,0.10);
    for(let i=0;i<steps;i++){
      const b = new THREE.Mesh(trunkGeo, trunkMat);
      const y = 0.28 + i*0.52;
      // gentle curve
      ox += rand(-0.06,0.06);
      oz += rand(-0.06,0.06);
      b.position.set(ox, y, oz);
      b.castShadow = true;
      b.receiveShadow = true;
      g.add(b);
    }

    // leaf clumps (blocky)
    const topY = 0.28 + (steps-1)*0.52 + 0.35;
    const leafGeo = new THREE.BoxGeometry(1.2, 0.35, 1.2);

    // center cap
    {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.9,0.35,0.9), leafMat);
      cap.position.set(ox, topY, oz);
      cap.castShadow = true; cap.receiveShadow = true;
      g.add(cap);
    }

    // 6 “fronds” as flat-ish boxes around
    for(let i=0;i<6;i++){
      const fr = new THREE.Mesh(leafGeo, leafMat);
      const ang = i*(Math.PI*2/6) + rand(-0.15,0.15);
      const r = 1.15 + rand(-0.15,0.25);
      fr.position.set(
        ox + Math.cos(ang)*r,
        topY - 0.10 + rand(-0.08,0.10),
        oz + Math.sin(ang)*r
      );
      fr.rotation.y = ang;
      fr.rotation.x = rand(-0.28, -0.12);
      fr.castShadow = true; fr.receiveShadow = true;
      g.add(fr);
    }

    return g;
  }

  // ---------- Buildings ----------
  function makeBuilding(w=6,h=7,d=6, color=0xd47b4c){
    const g = new THREE.Group();

    const bodyGeo = new THREE.BoxGeometry(w,h,d);
    const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.86 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = h/2;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);

    // windows
    const winMat = new THREE.MeshStandardMaterial({
      color: 0x9be7ff, roughness: 0.15, metalness: 0.05,
      transparent:true, opacity:0.28
    });
    const winGeo = new THREE.BoxGeometry(0.9, 0.9, 0.07);
    const cols = Math.max(2, Math.floor(w/2));
    const rows = Math.max(2, Math.floor(h/2.2));

    for(let r=0;r<rows;r++){
      for(let c=0;c<cols;c++){
        const win = new THREE.Mesh(winGeo, winMat);
        const x = -w/2 + 0.9 + c*(w/(cols+1));
        const y = 1.2 + r*(h/(rows+1));
        win.position.set(x,y,d/2+0.04);
        win.castShadow = false;
        win.receiveShadow = true;
        g.add(win);
      }
    }
    return g;
  }

  // ---------- Clouds ----------
  function makeCloud(){
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color:0xffffff, roughness:0.95, metalness:0 });

    // low-poly puffs (boxes)
    const parts = 4 + (Math.random()*4|0);
    for(let i=0;i<parts;i++){
      const w = rand(2.5, 6.0);
      const h = rand(0.9, 1.8);
      const d = rand(1.4, 3.8);
      const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
      m.position.set(rand(-2.5,2.5), rand(-0.2,0.6), rand(-1.8,1.8));
      m.castShadow = false;
      m.receiveShadow = false;
      g.add(m);
    }

    g.userData._cloud = {
      speed: rand(1.2, 2.4),
      wrapX: 140
    };
    return g;
  }

  window.World = {
    create(scene){
      const colliders = [];

      // Lights
      const hemi = new THREE.HemisphereLight(0xbfe7ff, 0x334455, 0.95);
      scene.add(hemi);

      const sun = new THREE.DirectionalLight(0xffffff, 1.05);
      sun.position.set(25, 40, 10);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048,2048);
      sun.shadow.camera.near = 0.5;
      sun.shadow.camera.far = 180;
      sun.shadow.camera.left = -60;
      sun.shadow.camera.right = 60;
      sun.shadow.camera.top = 60;
      sun.shadow.camera.bottom = -60;
      scene.add(sun);

      // Sky
      scene.background = new THREE.Color(0x6fd3ff);
      scene.fog = new THREE.Fog(0x6fd3ff, 40, 160);

      // Ocean (simple plane)
      const oceanGeo = new THREE.PlaneGeometry(260, 260, 40, 40);
      oceanGeo.rotateX(-Math.PI/2);
      const oceanMat = new THREE.MeshStandardMaterial({ color: 0x2a8fd7, roughness: 0.35, metalness: 0.0 });
      const ocean = new THREE.Mesh(oceanGeo, oceanMat);
      ocean.position.set(0, -0.3, -80);
      ocean.receiveShadow = true;
      ocean.userData.isPlaced = false;
      scene.add(ocean);

      // Beach sand
      const sandGeo = new THREE.PlaneGeometry(140, 140, 1, 1);
      sandGeo.rotateX(-Math.PI/2);
      const sandMat = new THREE.MeshStandardMaterial({ color: 0xe9d1a6, roughness: 0.96 });
      const sand = new THREE.Mesh(sandGeo, sandMat);
      sand.position.set(0, 0, 0);
      sand.receiveShadow = true;
      sand.userData.isPlaced = false;
      scene.add(sand);

      // Road + sidewalk
      const roadGeo = new THREE.PlaneGeometry(140, 16, 1, 1);
      roadGeo.rotateX(-Math.PI/2);
      const roadMat = new THREE.MeshStandardMaterial({ color: 0x2a3240, roughness: 0.96 });
      const road = new THREE.Mesh(roadGeo, roadMat);
      road.position.set(0, 0.01, 22);
      road.userData.isPlaced = false;
      scene.add(road);

      const sideGeo = new THREE.PlaneGeometry(140, 10, 1, 1);
      sideGeo.rotateX(-Math.PI/2);
      const sideMat = new THREE.MeshStandardMaterial({ color: 0x58606d, roughness: 0.96 });
      const side = new THREE.Mesh(sideGeo, sideMat);
      side.position.set(0, 0.02, 34);
      side.userData.isPlaced = false;
      scene.add(side);

      // Distant city blocks (colliders optional; we keep them far, no colliders needed)
      for(let i=0;i<16;i++){
        const b = makeBuilding(
          rand(5,10),
          rand(5,14),
          rand(5,10),
          new THREE.Color().setHSL(rand(0.02,0.12), 0.55, rand(0.48,0.62)).getHex()
        );
        b.position.set(rand(-55,55), 0, rand(55,120));
        b.rotation.y = rand(-0.6,0.6);
        b.traverse(o=>{ if(o.isMesh) o.userData.isPlaced = false; });
        scene.add(b);
      }

      // Palms near beach (colliders enabled)
      const palms = [];
      for(let i=0;i<12;i++){
        const p = makeMinecraftPalm();
        p.position.set(rand(-20,20), 0, rand(-10,20));
        p.rotation.y = rand(0, Math.PI*2);
        p.scale.setScalar(rand(0.9, 1.2));
        p.traverse(o=>{ if(o.isMesh) o.userData.isPlaced = false; });
        scene.add(p);
        palms.push(p);

        // collider: simple trunk column
        const pos = new THREE.Vector3();
        p.getWorldPosition(pos);
        pushBoxCollider(colliders, new THREE.Vector3(pos.x, 1.3, pos.z), new THREE.Vector3(0.9, 2.6, 0.9));
      }

      // Storefront shell (collider enabled)
      const store = new THREE.Group();
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(18, 5, 10),
        new THREE.MeshStandardMaterial({ color:0xd97a3b, roughness:0.9 })
      );
      base.position.set(24, 2.5, 10);
      base.castShadow = true; base.receiveShadow = true;
      base.userData.isPlaced = false;
      store.add(base);

      const sign = new THREE.Mesh(
        new THREE.BoxGeometry(9, 1.2, 0.6),
        new THREE.MeshStandardMaterial({ color:0x101421, roughness:0.6 })
      );
      sign.position.set(24, 4.7, 15.1);
      sign.castShadow = true; sign.receiveShadow = true;
      sign.userData.isPlaced = false;
      store.add(sign);

      const glassMat = new THREE.MeshStandardMaterial({
        color:0x9be7ff, roughness:0.15, metalness:0.05,
        transparent:true, opacity:0.18
      });
      const window = new THREE.Mesh(new THREE.BoxGeometry(16, 3.2, 0.12), glassMat);
      window.position.set(24, 2.2, 15.01);
      window.castShadow = false; window.receiveShadow = true;
      window.userData.isPlaced = false;
      store.add(window);

      store.position.y = 0.01;
      scene.add(store);

      // collider for store (big box)
      pushBoxCollider(colliders, new THREE.Vector3(24, 2.5, 10), new THREE.Vector3(18, 5, 10));

      // Lamp posts (colliders enabled)
      const lampMat = new THREE.MeshStandardMaterial({ color:0x64748b, roughness:0.85 });
      const bulbMat = new THREE.MeshStandardMaterial({
        color:0xffd34d, emissive:0xffd34d, emissiveIntensity:1.2, roughness:0.3
      });

      for(let i=0;i<5;i++){
        const g = new THREE.Group();

        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.16,4.2,8), lampMat);
        pole.position.y = 2.1;
        pole.castShadow = true; pole.receiveShadow = true;
        pole.userData.isPlaced = false;
        g.add(pole);

        const arm = new THREE.Mesh(new THREE.BoxGeometry(1.6,0.16,0.16), lampMat);
        arm.position.set(0.8, 3.7, 0);
        arm.castShadow = true; arm.receiveShadow = true;
        arm.userData.isPlaced = false;
        g.add(arm);

        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 10), bulbMat);
        bulb.position.set(1.55, 3.55, 0);
        bulb.castShadow = false; bulb.receiveShadow = true;
        bulb.userData.isPlaced = false;
        g.add(bulb);

        g.position.set(-22 + i*12, 0, 33);
        g.traverse(o=>{ if(o.isMesh) o.userData.isPlaced = false; });
        scene.add(g);

        // collider just for pole
        pushBoxCollider(colliders, new THREE.Vector3(g.position.x, 2.1, g.position.z), new THREE.Vector3(0.6, 4.2, 0.6));
      }

      // Clouds group (moving)
      const clouds = new THREE.Group();
      clouds.userData.isPlaced = false;
      scene.add(clouds);

      const cloudCount = 10;
      for(let i=0;i<cloudCount;i++){
        const c = makeCloud();
        c.position.set(rand(-120,120), rand(26, 38), rand(-80, 140));
        c.rotation.y = rand(0, Math.PI*2);
        c.traverse(o=>{ if(o.isMesh) o.userData.isPlaced = false; });
        clouds.add(c);
      }

      function update(dt){
        // drift clouds on +X, wrap
        clouds.children.forEach(c=>{
          const u = c.userData && c.userData._cloud;
          if(!u) return;
          c.position.x += u.speed * dt;
          if(c.position.x > u.wrapX) c.position.x = -u.wrapX;
        });
      }

      function getColliders(){
        return colliders;
      }

      return {
        ocean, sand, road, side, sun, store, clouds,
        update,
        getColliders
      };
    }
  };
})();
