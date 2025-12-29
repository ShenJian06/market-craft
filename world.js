// world.js — low-poly beach-town vibe scene
// Exposes: window.World

(function(){
  "use strict";

  function rand(a,b){ return a + Math.random()*(b-a); }

  function makePalm(){
    const g = new THREE.Group();

    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 3.2, 8, 1);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x9b6a3a, roughness: 0.9 });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 1.6;
    trunk.rotation.z = rand(-0.15, 0.15);
    g.add(trunk);

    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2fbf5b, roughness: 0.9 });
    for(let i=0;i<7;i++){
      const leafGeo = new THREE.ConeGeometry(0.22, 2.1, 6, 1);
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      leaf.position.y = 3.2;
      leaf.rotation.x = -Math.PI/2 + rand(-0.25, 0.25);
      leaf.rotation.z = i*(Math.PI*2/7);
      leaf.rotation.y = rand(-0.15, 0.15);
      leaf.position.x = Math.cos(leaf.rotation.z) * 0.2;
      leaf.position.z = Math.sin(leaf.rotation.z) * 0.2;
      g.add(leaf);
    }
    return g;
  }

  function makeBuilding(w=6,h=7,d=6, color=0xd47b4c){
    const g = new THREE.Group();
    const bodyGeo = new THREE.BoxGeometry(w,h,d);
    const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = h/2;
    g.add(body);

    // windows
    const winMat = new THREE.MeshStandardMaterial({ color: 0x9be7ff, roughness: 0.15, metalness: 0.05, transparent:true, opacity:0.35 });
    const winGeo = new THREE.BoxGeometry(0.9, 0.9, 0.07);
    const cols = Math.max(2, Math.floor(w/2));
    const rows = Math.max(2, Math.floor(h/2.2));
    for(let r=0;r<rows;r++){
      for(let c=0;c<cols;c++){
        const win = new THREE.Mesh(winGeo, winMat);
        const x = -w/2 + 0.9 + c*(w/(cols+1));
        const y = 1.2 + r*(h/(rows+1));
        win.position.set(x,y,d/2+0.04);
        g.add(win);
      }
    }
    return g;
  }

  window.World = {
    create(scene){
      // Lights
      const hemi = new THREE.HemisphereLight(0xbfe7ff, 0x334455, 0.95);
      scene.add(hemi);

      const sun = new THREE.DirectionalLight(0xffffff, 1.05);
      sun.position.set(25, 40, 10);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048,2048);
      sun.shadow.camera.near = 0.5;
      sun.shadow.camera.far = 120;
      sun.shadow.camera.left = -40;
      sun.shadow.camera.right = 40;
      sun.shadow.camera.top = 40;
      sun.shadow.camera.bottom = -40;
      scene.add(sun);

      // Sky
      scene.background = new THREE.Color(0x6fd3ff);
      scene.fog = new THREE.Fog(0x6fd3ff, 40, 140);

      // Ocean (simple plane)
      const oceanGeo = new THREE.PlaneGeometry(240, 240, 40, 40);
      oceanGeo.rotateX(-Math.PI/2);
      const oceanMat = new THREE.MeshStandardMaterial({ color: 0x2a8fd7, roughness: 0.35, metalness: 0.0 });
      const ocean = new THREE.Mesh(oceanGeo, oceanMat);
      ocean.position.set(0, -0.3, -70);
      ocean.receiveShadow = true;
      scene.add(ocean);

      // Beach sand
      const sandGeo = new THREE.PlaneGeometry(120, 120, 1, 1);
      sandGeo.rotateX(-Math.PI/2);
      const sandMat = new THREE.MeshStandardMaterial({ color: 0xe9d1a6, roughness: 0.95 });
      const sand = new THREE.Mesh(sandGeo, sandMat);
      sand.position.set(0, 0, 0);
      sand.receiveShadow = true;
      scene.add(sand);

      // Road + sidewalk
      const roadGeo = new THREE.PlaneGeometry(120, 16, 1, 1);
      roadGeo.rotateX(-Math.PI/2);
      const roadMat = new THREE.MeshStandardMaterial({ color: 0x2a3240, roughness: 0.95 });
      const road = new THREE.Mesh(roadGeo, roadMat);
      road.position.set(0, 0.01, 22);
      scene.add(road);

      const sideGeo = new THREE.PlaneGeometry(120, 10, 1, 1);
      sideGeo.rotateX(-Math.PI/2);
      const sideMat = new THREE.MeshStandardMaterial({ color: 0x58606d, roughness: 0.95 });
      const side = new THREE.Mesh(sideGeo, sideMat);
      side.position.set(0, 0.02, 34);
      scene.add(side);

      // Distant city blocks
      for(let i=0;i<16;i++){
        const b = makeBuilding(rand(5,10), rand(5,14), rand(5,10), new THREE.Color().setHSL(rand(0.02,0.12), 0.55, rand(0.48,0.62)).getHex());
        b.position.set(rand(-45,45), 0, rand(50,105));
        b.rotation.y = rand(-0.6,0.6);
        scene.add(b);
      }

      // Palms near beach
      for(let i=0;i<10;i++){
        const p = makePalm();
        p.position.set(rand(-18,18), 0, rand(-8,18));
        p.rotation.y = rand(0, Math.PI*2);
        p.scale.setScalar(rand(0.85, 1.25));
        scene.add(p);
      }

      // Storefront shell
      const store = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(18, 5, 10), new THREE.MeshStandardMaterial({ color:0xd97a3b, roughness:0.9 }));
      base.position.set(24, 2.5, 10);
      base.castShadow = true; base.receiveShadow = true;
      store.add(base);

      const sign = new THREE.Mesh(new THREE.BoxGeometry(9, 1.2, 0.6), new THREE.MeshStandardMaterial({ color:0x101421, roughness:0.6 }));
      sign.position.set(24, 4.7, 15.1);
      store.add(sign);

      const glassMat = new THREE.MeshStandardMaterial({ color:0x9be7ff, roughness:0.15, metalness:0.05, transparent:true, opacity:0.18 });
      const window = new THREE.Mesh(new THREE.BoxGeometry(16, 3.2, 0.12), glassMat);
      window.position.set(24, 2.2, 15.01);
      store.add(window);

      store.position.y = 0.01;
      scene.add(store);

      // Lamp posts
      const lampMat = new THREE.MeshStandardMaterial({ color:0x64748b, roughness:0.85 });
      const bulbMat = new THREE.MeshStandardMaterial({ color:0xffd34d, emissive:0xffd34d, emissiveIntensity:1.2, roughness:0.3 });
      for(let i=0;i<5;i++){
        const g = new THREE.Group();
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.16,4.2,8), lampMat);
        pole.position.y = 2.1;
        g.add(pole);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(1.6,0.16,0.16), lampMat);
        arm.position.set(0.8, 3.7, 0);
        g.add(arm);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 10), bulbMat);
        bulb.position.set(1.55, 3.55, 0);
        g.add(bulb);
        g.position.set(-22 + i*12, 0, 33);
        scene.add(g);
      }

      return {
        ocean, sand, road, side, sun,
        store
      };
    }
  };
})();
