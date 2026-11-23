// Wanted level and police. Stars rise when crimes are witnessed; police cars
// spawn on the road grid and chase the player (in a car or on foot), and foot
// officers join at two stars and up. Get out of sight and the heat cools off;
// get cornered on foot and you are busted.

import { WANTED, CITY } from './config.js';
import { makeCarMesh, createCarState, stepCar } from './vehicles.js';

export class Police {
  constructor(scene, city, rng, callbacks) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.cb = callbacks; // {onBusted, onDamage, onWantedChange}
    this.stars = 0;
    this.decayTimer = 0;
    this.bustTimer = 0;
    this.cars = []; // police cars {state, mesh, lightPhase}
    this.officers = []; // foot cops {mesh, x, z, heading, speed, shootTimer}
    this.flashTime = 0;
  }

  addStars(n, reason) {
    const before = this.stars;
    this.stars = Math.min(WANTED.maxStars, this.stars + n);
    this.decayTimer = 0;
    if (this.stars !== before && this.cb.onWantedChange) {
      this.cb.onWantedChange(this.stars, reason);
    }
  }

  clear() {
    this.stars = 0;
    this.decayTimer = 0;
    this.bustTimer = 0;
    this.removeAll();
  }

  removeAll() {
    for (const car of this.cars) this.scene.remove(car.mesh);
    this.cars = [];
    for (const cop of this.officers) this.scene.remove(cop.mesh);
    this.officers = [];
  }

  wantedCount() {
    return this.stars;
  }

  // How many police cars the heat calls for right now.
  targetCarCount() {
    if (this.stars === 0) return 0;
    return Math.min(1 + this.stars, 4);
  }

  targetOfficerCount() {
    if (this.stars < 2) return 0;
    return Math.min(this.stars - 1, 2);
  }

  spawnCarNear(x, z) {
    const point = this.city.randomRoadPoint(55, x, z);
    const mesh = makeCarMesh(0x1c2733, true);
    mesh.position.set(point.x, 0, point.z);
    this.scene.add(mesh);
    const car = {
      state: createCarState(point.x, point.z, this.rng.range(0, Math.PI * 2), 0),
      mesh,
      lightPhase: this.rng.range(0, 1),
    };
    this.cars.push(car);
    return car;
  }

  spawnOfficerNear(x, z) {
    const point = this.city.randomRoadPoint(28, x, z);
    const mesh = this.makeOfficerMesh();
    mesh.position.set(point.x, 0, point.z);
    this.scene.add(mesh);
    const cop = {
      mesh,
      x: point.x,
      z: point.z,
      heading: 0,
      speed: 5.4,
      shootTimer: 1 + this.rng.range(0, 1),
      walkPhase: 0,
    };
    this.officers.push(cop);
    return cop;
  }

  makeOfficerMesh() {
    const group = new THREE.Group();
    const uniform = new THREE.MeshLambertMaterial({ color: 0x1c2733 });
    const skin = new THREE.MeshLambertMaterial({ color: 0xd9a986 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.9, 0.36), uniform);
    torso.position.y = 1.05;
    torso.castShadow = true;
    group.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 8), skin);
    head.position.y = 1.74;
    group.add(head);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.12, 10), uniform);
    cap.position.y = 1.94;
    group.add(cap);
    const legGeo = new THREE.BoxGeometry(0.22, 0.62, 0.24);
    const legL = new THREE.Mesh(legGeo, uniform);
    legL.position.set(-0.16, 0.31, 0);
    group.add(legL);
    const legR = new THREE.Mesh(legGeo, uniform);
    legR.position.set(0.16, 0.31, 0);
    group.add(legR);
    group.userData.legL = legL;
    group.userData.legR = legR;
    return group;
  }

  // Nearest police car distance to (x, z), or Infinity.
  nearestCarDist(x, z) {
    let best = Infinity;
    for (const car of this.cars) {
      const dx = car.state.x - x;
      const dz = car.state.z - z;
      best = Math.min(best, Math.sqrt(dx * dx + dz * dz));
    }
    return best;
  }

  update(dt, player) {
    // player: {x, z, inCar, speed, health}
    this.flashTime += dt;
    const wantCars = this.targetCarCount();
    while (this.cars.length < wantCars) this.spawnCarNear(player.x, player.z);
    while (this.cars.length > wantCars) {
      const car = this.cars.pop();
      this.scene.remove(car.mesh);
    }
    const wantCops = this.targetOfficerCount();
    while (this.officers.length < wantCops) this.spawnOfficerNear(player.x, player.z);
    while (this.officers.length > wantCops) {
      const cop = this.officers.pop();
      this.scene.remove(cop.mesh);
    }

    // Pursuit: steer each police car toward the player and ram.
    const others = this.cars.map((c) => c.state);
    for (const car of this.cars) {
      const dx = player.x - car.state.x;
      const dz = player.z - car.state.z;
      const dist = Math.sqrt(dx * dx + dz * dz) || 1;
      const wantHeading = Math.atan2(-dx / dist, -dz / dist);
      let diff = wantHeading - car.state.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const steer = Math.max(-1, Math.min(1, diff * 2.2));
      const top = Math.min(34, 24 + this.stars * 2);
      const throttle = dist > 6 ? 1 : 0.4;
      stepCar(car.state, { throttle, steer, brake: false }, dt, this.city, others);
      // Cap police top speed (stepCar uses the shared CAR limits).
      if (car.state.speed > top) car.state.speed = top;
      car.mesh.position.set(car.state.x, 0, car.state.z);
      car.mesh.rotation.y = car.state.heading;
      const spin = car.state.speed * dt * 2.4;
      for (const w of car.mesh.userData.wheels) w.rotation.x += spin;
      // Flashing light bar.
      const bar = car.mesh.userData.lightBar;
      if (bar) {
        const phase = (this.flashTime * 4 + car.lightPhase) % 1 < 0.5;
        bar.userData.red.material.color.setHex(phase ? 0xff2020 : 0x551010);
        bar.userData.blue.material.color.setHex(phase ? 0x101055 : 0x2050ff);
      }
      // Ramming the player's car hurts the player; touching the player on
      // foot starts the bust clock.
      if (dist < 3.4) {
        if (player.inCar) {
          if (Math.abs(car.state.speed) > 8 && this.cb.onDamage) {
            this.cb.onDamage(6, 'rammed by a police cruiser');
          }
          car.state.speed *= 0.6;
        }
      }
    }

    // Foot officers chase and shoot.
    for (const cop of this.officers) {
      const dx = player.x - cop.x;
      const dz = player.z - cop.z;
      const dist = Math.sqrt(dx * dx + dz * dz) || 1;
      const targetHeading = Math.atan2(dx / dist, dz / dist);
      let diff = targetHeading - cop.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      cop.heading += diff * Math.min(1, dt * 5);
      if (dist > 4) {
        cop.x += Math.sin(cop.heading) * cop.speed * dt;
        cop.z += Math.cos(cop.heading) * cop.speed * dt;
      }
      const res = this.city.collideCircle(cop.x, cop.z, 0.6);
      cop.x = res.x;
      cop.z = res.z;
      cop.mesh.position.set(cop.x, 0, cop.z);
      cop.mesh.rotation.y = cop.heading + Math.PI; // mesh faces -sin/-cos
      cop.walkPhase += dt * 9;
      const swing = Math.sin(cop.walkPhase) * 0.45;
      cop.mesh.userData.legL.rotation.x = swing;
      cop.mesh.userData.legR.rotation.x = -swing;
      cop.shootTimer -= dt;
      if (cop.shootTimer <= 0 && dist < 30 && !player.inCar) {
        cop.shootTimer = 1.1 + this.rng.range(0, 0.7);
        if (this.rng.chance(0.3) && this.cb.onDamage) {
          this.cb.onDamage(7, 'shot by an officer');
        }
      }
    }

    // Busted: on foot, a police car sitting on the player for a while.
    if (!player.inCar && this.stars > 0) {
      const near = this.nearestCarDist(player.x, player.z);
      const copNear = this.officers.some((c) => {
        const dx = c.x - player.x;
        const dz = c.z - player.z;
        return dx * dx + dz * dz < 9;
      });
      if ((near < WANTED.bustDistance && player.speed < 3) || copNear) {
        this.bustTimer += dt;
        if (this.bustTimer > WANTED.bustSeconds && this.cb.onBusted) {
          this.bustTimer = 0;
          this.cb.onBusted();
        }
      } else {
        this.bustTimer = Math.max(0, this.bustTimer - dt * 2);
      }
    } else {
      this.bustTimer = 0;
    }

    // Wanted decay when no police car is close.
    if (this.stars > 0) {
      const near = this.nearestCarDist(player.x, player.z);
      if (near > WANTED.decayRange && this.officers.length === 0) {
        this.decayTimer += dt;
        if (this.decayTimer > WANTED.decaySeconds) {
          this.decayTimer = 0;
          this.stars -= 1;
          if (this.cb.onWantedChange) this.cb.onWantedChange(this.stars, 'cooling off');
        }
      } else {
        this.decayTimer = 0;
      }
    }
  }
}
