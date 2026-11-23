// Pedestrians: simple figures that stroll the sidewalks, stop and chat in
// pairs, and run from danger — gunfire, a speeding car, or a body on the ground.
// A pedestrian who is hit hard or shot falls and drops cash.

import { CITY, PALETTE, PEDS } from './config.js';

function makePedMesh(color) {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a986 });
  const shirt = new THREE.MeshLambertMaterial({ color });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2c2f36 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.85, 0.34), shirt);
  torso.position.y = 1.05;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), skin);
  head.position.y = 1.72;
  head.castShadow = true;
  group.add(head);
  const legGeo = new THREE.BoxGeometry(0.22, 0.62, 0.24);
  const legL = new THREE.Mesh(legGeo, pants);
  legL.position.set(-0.16, 0.31, 0);
  group.add(legL);
  const legR = new THREE.Mesh(legGeo, pants);
  legR.position.set(0.16, 0.31, 0);
  group.add(legR);
  group.userData.legL = legL;
  group.userData.legR = legR;
  return group;
}

export class Pedestrians {
  constructor(scene, city, rng) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.peds = [];
    this.cashDrops = []; // {x, z, amount, mesh}
    for (let i = 0; i < PEDS.count; i += 1) {
      this.spawn(this.randomSidewalkPoint());
    }
  }

  randomSidewalkPoint() {
    for (let tries = 0; tries < 30; tries += 1) {
      const x = this.rng.range(-CITY.half + 6, CITY.half - 6);
      const z = this.rng.range(-CITY.half + 6, CITY.half - 6);
      if (!this.city.isOnRoad(x, z)) return { x, z };
    }
    return { x: 10, z: 10 };
  }

  spawn(point) {
    const mesh = makePedMesh(this.rng.pick(PALETTE.ped));
    mesh.position.set(point.x, 0, point.z);
    this.scene.add(mesh);
    const ped = {
      mesh,
      x: point.x,
      z: point.z,
      heading: this.rng.range(0, Math.PI * 2),
      speed: this.rng.range(1.0, 1.8),
      health: 100,
      state: 'walk', // walk | flee | down | dead
      target: this.randomSidewalkPoint(),
      fleeFrom: null,
      fleeTime: 0,
      walkPhase: this.rng.range(0, 6),
      dead: false,
    };
    this.peds.push(ped);
    return ped;
  }

  // Danger at (x, z): everyone nearby runs away from it.
  scare(x, z, radius) {
    for (const ped of this.peds) {
      if (ped.dead || ped.state === 'down') continue;
      const dx = ped.x - x;
      const dz = ped.z - z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < radius) {
        ped.state = 'flee';
        ped.fleeFrom = { x, z };
        ped.fleeTime = 3 + this.rng.range(0, 2);
      }
    }
  }

  damage(ped, amount, fromX, fromZ) {
    if (ped.dead) return false;
    ped.health -= amount;
    this.scare(fromX, fromZ, 26);
    if (ped.health <= 0) {
      ped.dead = true;
      ped.state = 'dead';
      ped.mesh.rotation.x = -Math.PI / 2;
      ped.mesh.position.y = 0.35;
      this.dropCash(ped.x, ped.z, 40 + this.rng.int(0, 40));
      return true;
    }
    return false;
  }

  dropCash(x, z, amount) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.12, 0.45),
      new THREE.MeshLambertMaterial({ color: 0x3fae5a }),
    );
    mesh.position.set(x, 0.2, z);
    this.scene.add(mesh);
    this.cashDrops.push({ x, z, amount, mesh });
  }

  // Pick up any cash drop within reach; returns the amount collected.
  collectCash(x, z, radius) {
    let gained = 0;
    for (let i = this.cashDrops.length - 1; i >= 0; i -= 1) {
      const drop = this.cashDrops[i];
      const dx = drop.x - x;
      const dz = drop.z - z;
      if (dx * dx + dz * dz < radius * radius) {
        gained += drop.amount;
        this.scene.remove(drop.mesh);
        this.cashDrops.splice(i, 1);
      }
    }
    return gained;
  }

  nearest(x, z, maxDist, aliveOnly) {
    let best = null;
    let bestD = maxDist;
    for (const ped of this.peds) {
      if (aliveOnly && ped.dead) continue;
      const dx = ped.x - x;
      const dz = ped.z - z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < bestD) {
        best = ped;
        bestD = d;
      }
    }
    return best;
  }

  update(dt, time) {
    for (const ped of this.peds) {
      if (ped.dead) continue;
      if (ped.state === 'flee') {
        ped.fleeTime -= dt;
        const dx = ped.x - ped.fleeFrom.x;
        const dz = ped.z - ped.fleeFrom.z;
        const d = Math.sqrt(dx * dx + dz * dz) || 1;
        const targetHeading = Math.atan2(dx / d, dz / d);
        ped.heading += (targetHeading - ped.heading) * Math.min(1, dt * 6);
        ped.x += Math.sin(ped.heading) * 5.2 * dt;
        ped.z += Math.cos(ped.heading) * 5.2 * dt;
        if (ped.fleeTime <= 0) {
          ped.state = 'walk';
          ped.target = this.randomSidewalkPoint();
        }
      } else {
        const dx = ped.target.x - ped.x;
        const dz = ped.target.z - ped.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d < 1.5) {
          ped.target = this.randomSidewalkPoint();
        } else {
          const targetHeading = Math.atan2(dx / d, dz / d);
          let diff = targetHeading - ped.heading;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          ped.heading += diff * Math.min(1, dt * 4);
          ped.x += Math.sin(ped.heading) * ped.speed * dt;
          ped.z += Math.cos(ped.heading) * ped.speed * dt;
        }
      }
      const res = this.city.collideCircle(ped.x, ped.z, 0.5);
      ped.x = res.x;
      ped.z = res.z;
      ped.mesh.position.set(ped.x, 0, ped.z);
      ped.mesh.rotation.y = ped.heading + Math.PI; // mesh faces -sin/-cos
      ped.walkPhase += dt * (ped.state === 'flee' ? 11 : 6);
      const swing = Math.sin(ped.walkPhase) * 0.5;
      ped.mesh.userData.legL.rotation.x = swing;
      ped.mesh.userData.legR.rotation.x = -swing;
    }
    for (const drop of this.cashDrops) {
      drop.mesh.rotation.y += dt;
    }
  }
}
