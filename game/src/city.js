// Solmar Bay: a 5x5 block city with roads, sidewalks, buildings, a central park,
// lamps, trees and street props. Buildings are shared-geometry boxes with a
// procedural window texture; every building registers an AABB collider used by
// players, cars, traffic and police.

import { CITY, PALETTE, PLACES } from './config.js';

// A small canvas texture: lit windows on a dark facade. One texture is shared
// by every building, tinted per building by its material colour.
function makeWindowTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 256);
  const rows = 12;
  const cols = 5;
  for (let r = 0; r < rows; r += 1) {
    for (let col = 0; col < cols; col += 1) {
      const lit = ((r * 7 + col * 13) % 5) < 2;
      g.fillStyle = lit ? '#ffd98a' : '#33475e';
      g.fillRect(8 + col * 24, 10 + r * 20, 14, 12);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export class City {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    this.colliders = []; // {minX,maxX,minZ,maxZ}
    this.lamps = [];
    this.group = new THREE.Group();
    scene.add(this.group);
    this.buildGround();
    this.buildRoads();
    this.buildBuildings();
    this.buildPark();
    this.buildProps();
    this.buildBeacon();
  }

  addCollider(minX, maxX, minZ, maxZ) {
    this.colliders.push({ minX, maxX, minZ, maxZ });
  }

  // Push a circle (x, z, radius) out of every collider it overlaps.
  // Returns true when a collision happened.
  collideCircle(x, z, radius) {
    let hit = false;
    for (const c of this.colliders) {
      const cx = Math.max(c.minX, Math.min(x, c.maxX));
      const cz = Math.max(c.minZ, Math.min(z, c.maxZ));
      const dx = x - cx;
      const dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        hit = true;
        if (d2 > 0.0001) {
          const d = Math.sqrt(d2);
          const push = (radius - d) / d;
          x += dx * push;
          z += dz * push;
        } else {
          // Centre inside the box: push out along the smallest penetration.
          const pl = x - c.minX;
          const pr = c.maxX - x;
          const pt = z - c.minZ;
          const pb = c.maxZ - z;
          const m = Math.min(pl, pr, pt, pb);
          if (m === pl) x = c.minX - radius;
          else if (m === pr) x = c.maxX + radius;
          else if (m === pt) z = c.minZ - radius;
          else z = c.maxZ + radius;
        }
      }
    }
    return { x, z, hit };
  }

  // True when the point is on a road (used to keep pedestrians on sidewalks).
  isOnRoad(x, z) {
    const half = CITY.road / 2 + 0.5;
    for (const r of CITY.roads) {
      if (Math.abs(x - r) < half || Math.abs(z - r) < half) return true;
    }
    return false;
  }

  // A random point on a road centre line, for spawning police.
  randomRoadPoint(minDist, fromX, fromZ) {
    for (let tries = 0; tries < 20; tries += 1) {
      const horizontal = this.rng.chance(0.5);
      const road = this.rng.pick(CITY.roads);
      const along = this.rng.range(-CITY.half + 8, CITY.half - 8);
      const x = horizontal ? along : road;
      const z = horizontal ? road : along;
      const dx = x - fromX;
      const dz = z - fromZ;
      if (dx * dx + dz * dz > minDist * minDist) return { x, z };
    }
    return { x: -CITY.roads[0], z: 0 };
  }

  buildGround() {
    const size = CITY.half * 2 + 60;
    const geo = new THREE.PlaneGeometry(size, size);
    const mat = new THREE.MeshLambertMaterial({ color: PALETTE.ground });
    const ground = new THREE.Mesh(geo, mat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.group.add(ground);
  }

  buildRoads() {
    const roadMat = new THREE.MeshLambertMaterial({ color: PALETTE.road });
    const walkMat = new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk });
    const lineMat = new THREE.MeshBasicMaterial({ color: PALETTE.roadLine });
    const len = CITY.half * 2 + 8;
    for (const r of CITY.roads) {
      for (const horizontal of [true, false]) {
        const road = new THREE.Mesh(new THREE.PlaneGeometry(len, CITY.road), roadMat);
        road.rotation.x = -Math.PI / 2;
        road.position.set(horizontal ? 0 : r, 0.02, horizontal ? r : 0);
        if (!horizontal) road.rotation.z = Math.PI / 2;
        road.receiveShadow = true;
        this.group.add(road);
        // Sidewalk strips along both edges of the road.
        for (const side of [-1, 1]) {
          const walk = new THREE.Mesh(new THREE.PlaneGeometry(len, 3), walkMat);
          walk.rotation.x = -Math.PI / 2;
          const off = r + side * (CITY.road / 2 + 1.5);
          walk.position.set(horizontal ? 0 : off, 0.03, horizontal ? off : 0);
          if (!horizontal) walk.rotation.z = Math.PI / 2;
          walk.receiveShadow = true;
          this.group.add(walk);
        }
        // Dashed centre line.
        const dashGeo = new THREE.PlaneGeometry(4, 0.35);
        const count = Math.floor(len / 9);
        for (let i = 0; i < count; i += 1) {
          const dash = new THREE.Mesh(dashGeo, lineMat);
          dash.rotation.x = -Math.PI / 2;
          const along = -CITY.half + 4 + i * 9;
          dash.position.set(horizontal ? along : r, 0.04, horizontal ? r : along);
          if (!horizontal) dash.rotation.z = Math.PI / 2;
          this.group.add(dash);
        }
      }
    }
  }

  buildBuildings() {
    const tex = makeWindowTexture();
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const mats = PALETTE.building.map(
      (c) => new THREE.MeshLambertMaterial({ color: c, map: tex }),
    );
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x55504a });
    const rng = this.rng;
    for (const bx of CITY.blockCentres) {
      for (const bz of CITY.blockCentres) {
        if (bx === 0 && bz === 0) continue; // central park
        const plots = [
          [-11, -11],
          [11, -11],
          [-11, 11],
          [11, 11],
        ];
        for (const [ox, oz] of plots) {
          if (rng.chance(0.12)) continue; // occasional empty lot
          const w = rng.range(13, 19);
          const d = rng.range(13, 19);
          const distCentre = Math.abs(bx) + Math.abs(bz);
          const tall = distCentre < 60 && rng.chance(0.5);
          const h = tall ? rng.range(34, 58) : rng.range(9, 26);
          // Clone the shared window texture per building so the windows stay
          // the same size whatever the building's height: one tile per 9 units.
          const mat = rng.pick(mats).clone();
          mat.map = tex.clone();
          mat.map.repeat.set(Math.max(1, Math.round(w / 9)), Math.max(1, Math.round(h / 9)));
          mat.map.needsUpdate = true;
          const mesh = new THREE.Mesh(boxGeo, mat);
          mesh.scale.set(w, h, d);
          mesh.position.set(bx + ox, h / 2, bz + oz);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          this.group.add(mesh);
          const roof = new THREE.Mesh(boxGeo, roofMat);
          roof.scale.set(w + 0.6, 0.5, d + 0.6);
          roof.position.set(bx + ox, h + 0.25, bz + oz);
          this.group.add(roof);
          this.addCollider(bx + ox - w / 2, bx + ox + w / 2, bz + oz - d / 2, bz + oz + d / 2);
        }
      }
    }
  }

  buildPark() {
    const parkMat = new THREE.MeshLambertMaterial({ color: PALETTE.park });
    const park = new THREE.Mesh(
      new THREE.PlaneGeometry(CITY.block - 4, CITY.block - 4),
      parkMat,
    );
    park.rotation.x = -Math.PI / 2;
    park.position.set(0, 0.05, 0);
    park.receiveShadow = true;
    this.group.add(park);
    // Fountain in the middle.
    const basin = new THREE.Mesh(
      new THREE.CylinderGeometry(6, 6.6, 1.2, 20),
      new THREE.MeshLambertMaterial({ color: 0x9aa0a3 }),
    );
    basin.position.set(0, 0.6, 0);
    basin.castShadow = true;
    this.group.add(basin);
    const water = new THREE.Mesh(
      new THREE.CylinderGeometry(5.2, 5.2, 0.3, 20),
      new THREE.MeshLambertMaterial({ color: 0x3f8fbf }),
    );
    water.position.set(0, 1.2, 0);
    this.group.add(water);
    this.addCollider(-6.6, 6.6, -6.6, 6.6);
  }

  buildProps() {
    const lampPoleMat = new THREE.MeshLambertMaterial({ color: 0x2a2d33 });
    const lampHeadMat = new THREE.MeshBasicMaterial({ color: PALETTE.lamp });
    const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 6, 6);
    const headGeo = new THREE.SphereGeometry(0.35, 8, 6);
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.3, 2.4, 6);
    const trunkMat = new THREE.MeshLambertMaterial({ color: PALETTE.trunk });
    const leafGeo = new THREE.SphereGeometry(1.9, 8, 6);
    const leafMat = new THREE.MeshLambertMaterial({ color: PALETTE.tree });
    const rng = this.rng;

    // Lamps at road intersections.
    for (const rx of CITY.roads) {
      for (const rz of CITY.roads) {
        if (rng.chance(0.35)) continue;
        const pole = new THREE.Mesh(poleGeo, lampPoleMat);
        pole.position.set(rx + CITY.road / 2 + 1.6, 3, rz + CITY.road / 2 + 1.6);
        pole.castShadow = true;
        this.group.add(pole);
        const head = new THREE.Mesh(headGeo, lampHeadMat);
        head.position.set(rx + CITY.road / 2 + 1.6, 6.2, rz + CITY.road / 2 + 1.6);
        this.group.add(head);
        this.lamps.push(head.position.clone());
      }
    }
    // Trees: park rows and scattered block corners.
    const treeSpots = [];
    for (let i = -3; i <= 3; i += 1) {
      treeSpots.push([-16 + i * 5, -16]);
      treeSpots.push([-16 + i * 5, 16]);
      treeSpots.push([-16, -16 + i * 5]);
      treeSpots.push([16, -16 + i * 5]);
    }
    for (const bx of CITY.blockCentres) {
      for (const bz of CITY.blockCentres) {
        if (bx === 0 && bz === 0) continue;
        if (rng.chance(0.4)) treeSpots.push([bx + 19, bz + 19]);
        if (rng.chance(0.4)) treeSpots.push([bx - 19, bz - 19]);
      }
    }
    for (const [x, z] of treeSpots) {
      if (this.isOnRoad(x, z)) continue;
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.set(x, 1.2, z);
      trunk.castShadow = true;
      this.group.add(trunk);
      const leaves = new THREE.Mesh(leafGeo, leafMat);
      leaves.position.set(x, 3.6, z);
      leaves.castShadow = true;
      this.group.add(leaves);
    }
  }

  // The floating mission beacon: a glowing pillar and ring the player follows.
  buildBeacon() {
    const beamMat = new THREE.MeshBasicMaterial({
      color: PALETTE.beacon,
      transparent: true,
      opacity: 0.15,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.beacon = new THREE.Group();
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 60, 12, 1, true), beamMat);
    beam.position.y = 30;
    this.beacon.add(beam);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.4, 3.4, 24),
      new THREE.MeshBasicMaterial({ color: PALETTE.beacon, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.15;
    this.beacon.add(ring);
    const diamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.85),
      new THREE.MeshBasicMaterial({ color: PALETTE.beacon }),
    );
    diamond.position.y = 7;
    this.beacon.add(diamond);
    this.beaconDiamond = diamond;
    this.beacon.visible = false;
    this.scene.add(this.beacon);
  }

  moveBeacon(x, z) {
    this.beacon.position.set(x, 0, z);
    this.beacon.visible = true;
  }

  hideBeacon() {
    this.beacon.visible = false;
  }

  update(dt, time) {
    if (this.beacon.visible) {
      this.beaconDiamond.rotation.y += dt * 2;
      this.beaconDiamond.position.y = 7 + Math.sin(time * 2.2) * 0.7;
    }
  }
}
