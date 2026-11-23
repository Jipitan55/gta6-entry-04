// Cars: a shared box-built car mesh, arcade driving physics, and the traffic
// system — AI cars that follow the road grid, slow for the car ahead and turn
// at intersections. Police cars reuse the same mesh with a light bar.

import { CAR, CITY, TRAFFIC, PALETTE } from './config.js';

const BODY_COLORS = [0xc23b3b, 0x3b6fc2, 0xe0a83c, 0x4f9e57, 0x8a8f96, 0xd0d4d8, 0x2f2f38, 0x7a4fd0];

export function makeCarMesh(color, isPolice) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const glassMat = new THREE.MeshLambertMaterial({ color: PALETTE.glass });
  const tyreMat = new THREE.MeshLambertMaterial({ color: 0x141414 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.2), glassMat);
  cabin.position.set(0, 1.08, -0.2);
  cabin.castShadow = true;
  group.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const wheel = new THREE.Mesh(wheelGeo, tyreMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.38, wz);
    group.add(wheel);
    wheels.push(wheel);
  }
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const hx of [-0.6, 0.6]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.08), headMat);
    lamp.position.set(hx, 0.62, 2.22);
    group.add(lamp);
  }
  let lightBar = null;
  if (isPolice) {
    lightBar = new THREE.Group();
    const red = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.22, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xff2020 }),
    );
    red.position.x = -0.35;
    const blue = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.22, 0.5),
      new THREE.MeshBasicMaterial({ color: 0x2050ff }),
    );
    blue.position.x = 0.35;
    lightBar.add(red);
    lightBar.add(blue);
    lightBar.position.set(0, 1.48, -0.2);
    lightBar.userData.red = red;
    lightBar.userData.blue = blue;
    group.add(lightBar);
  }
  group.userData.wheels = wheels;
  group.userData.lightBar = lightBar;
  return group;
}

// Arcade car: position, heading, speed. Forward is -Z of the mesh's local space
// rotated by heading; heading 0 faces -Z (north).
export function createCarState(x, z, heading, speed) {
  return { x, z, heading, speed: speed || 0, steer: 0 };
}

// One physics step for a driven car. `drive` is {throttle:-1..1, steer:-1..1,
// brake:boolean}. Collisions with buildings slide the car and bleed speed;
// collisions with other cars push both apart.
export function stepCar(car, drive, dt, city, otherCars) {
  const accel = drive.throttle >= 0 ? CAR.accel * drive.throttle : CAR.reverseAccel * drive.throttle;
  car.speed += accel * dt;
  if (drive.brake) {
    const s = Math.sign(car.speed);
    car.speed -= s * CAR.brake * dt;
    if (Math.sign(car.speed) !== s) car.speed = 0;
  }
  car.speed -= car.speed * CAR.drag * dt;
  car.speed = Math.max(-CAR.maxReverse, Math.min(CAR.maxSpeed, car.speed));
  if (Math.abs(car.speed) < 0.05) car.speed = 0;

  const targetSteer = drive.steer * CAR.steerMax;
  car.steer += (targetSteer - car.steer) * Math.min(1, dt * 8);
  const speedFactor = Math.min(1, Math.abs(car.speed) / 10);
  car.heading += car.steer * speedFactor * (car.speed >= 0 ? 1 : -1) * dt * 1.9;

  const fx = car.x - Math.sin(car.heading) * car.speed * dt;
  const fz = car.z - Math.cos(car.heading) * car.speed * dt;
  const res = city.collideCircle(fx, fz, CAR.radius);
  if (res.hit && Math.abs(car.speed) > 4) car.speed *= 0.55;
  car.x = res.x;
  car.z = res.z;

  if (otherCars) {
    for (const other of otherCars) {
      if (other === car) continue;
      const dx = car.x - other.x;
      const dz = car.z - other.z;
      const d2 = dx * dx + dz * dz;
      const min = CAR.radius * 2 - 0.4;
      if (d2 < min * min && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        const push = (min - d) / 2;
        car.x += (dx / d) * push;
        car.z += (dz / d) * push;
        other.x -= (dx / d) * push;
        other.z -= (dz / d) * push;
        const avg = (car.speed + other.speed) / 2;
        car.speed = avg * 0.9;
        other.speed = avg * 0.9;
      }
    }
  }
  return car;
}

export class Traffic {
  constructor(scene, city, rng) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.cars = [];
    const lanes = [-3.2, 3.2];
    for (let i = 0; i < TRAFFIC.count; i += 1) {
      const horizontal = rng.chance(0.5);
      const road = rng.pick(CITY.roads);
      const along = rng.range(-CITY.half + 10, CITY.half - 10);
      const lane = rng.pick(lanes);
      const dir = rng.chance(0.5) ? 1 : -1;
      const x = horizontal ? along : road + lane;
      const z = horizontal ? road + lane : along;
      // Heading: north is -Z. Horizontal roads run east-west.
      let heading;
      if (horizontal) heading = dir > 0 ? -Math.PI / 2 : Math.PI / 2;
      else heading = dir > 0 ? Math.PI : 0;
      const mesh = makeCarMesh(rng.pick(BODY_COLORS), false);
      mesh.position.set(x, 0, z);
      mesh.rotation.y = heading;
      scene.add(mesh);
      this.cars.push({
        mesh,
        x,
        z,
        heading,
        speed: rng.range(TRAFFIC.speedMin, TRAFFIC.speedMax),
        cruise: rng.range(TRAFFIC.speedMin, TRAFFIC.speedMax),
        horizontal,
        road,
        dir,
        lane,
      });
    }
  }

  // The car ahead on the same road and lane, within `dist`.
  carAhead(car, dist) {
    let best = null;
    let bestD = dist;
    for (const other of this.cars) {
      if (other === car || other.horizontal !== car.horizontal) continue;
      if (Math.abs(other.road - car.road) > 1) continue;
      const along = car.horizontal ? other.x - car.x : other.z - car.z;
      const forward = along * car.dir;
      if (forward > 0 && forward < bestD) {
        best = other;
        bestD = forward;
      }
    }
    return best;
  }

  update(dt, playerCar) {
    for (const car of this.cars) {
      // Slow or stop for the car ahead (crude avoidance).
      const ahead = this.carAhead(car, 11);
      let target = car.cruise;
      if (ahead) {
        const gap = car.horizontal
          ? Math.abs(ahead.x - car.x)
          : Math.abs(ahead.z - car.z);
        target = gap < 7 ? 0 : car.cruise * 0.4;
      }
      car.speed += (target - car.speed) * Math.min(1, dt * 1.6);
      const step = car.speed * dt;
      let nx = car.x;
      let nz = car.z;
      if (car.horizontal) nx += car.dir * step;
      else nz += car.dir * step;
      // At an intersection, sometimes turn onto the crossing road.
      const onCrossing = CITY.roads.some(
        (r) => Math.abs((car.horizontal ? nx : nz) - r) < 2,
      );
      if (onCrossing && this.rng.chance(dt * 0.35)) {
        const cross = this.rng.pick(CITY.roads);
        const newDir = this.rng.chance(0.5) ? 1 : -1;
        const lane = this.rng.pick([-3.2, 3.2]);
        if (car.horizontal) {
          car.horizontal = false;
          car.road = cross;
          car.z = cross + lane;
          car.heading = newDir > 0 ? Math.PI : 0;
        } else {
          car.horizontal = true;
          car.road = cross;
          car.x = cross + lane;
          car.heading = newDir > 0 ? -Math.PI / 2 : Math.PI / 2;
        }
        car.dir = newDir;
        nx = car.x;
        nz = car.z;
      }
      // Wrap around the city edge so traffic never runs out.
      if (nx > CITY.half + 6) nx = -CITY.half - 6;
      if (nx < -CITY.half - 6) nx = CITY.half + 6;
      if (nz > CITY.half + 6) nz = -CITY.half - 6;
      if (nz < -CITY.half - 6) nz = CITY.half + 6;
      car.x = nx;
      car.z = nz;
      // Keep off buildings (traffic stays on roads, but turns can clip a corner).
      const res = this.city.collideCircle(car.x, car.z, 2);
      car.x = res.x;
      car.z = res.z;
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;
      const spin = car.speed * dt * 2.4;
      for (const w of car.mesh.userData.wheels) w.rotation.x += spin;
    }
  }

  nearest(x, z, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const car of this.cars) {
      const dx = car.x - x;
      const dz = car.z - z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < bestD) {
        best = car;
        bestD = d;
      }
    }
    return best;
  }

  remove(car) {
    const i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
    this.scene.remove(car.mesh);
  }
}
