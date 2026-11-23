// SOLMAR HEAT — the game itself: third-person open-world crime in Solmar Bay.
// Wires the city, traffic, pedestrians, police, combat, missions and HUD into
// one loop. Playable states: title, playing, paused, busted, wasted, complete.

import { CITY, PLACES, PLAYER, PISTOL, CAR, MISSIONS, STORY, TITLE, SUBTITLE, CONTROLS } from './config.js';
import { makeRng } from './random.js';
import { SoundBank } from './audio.js';
import { Input } from './input.js';
import { loadSave, writeSave, clearSave } from './save.js';
import { City } from './city.js';
import { Traffic, makeCarMesh, createCarState, stepCar } from './vehicles.js';
import { Pedestrians } from './people.js';
import { Police } from './police.js';
import { Combat } from './combat.js';
import { MissionManager } from './missions.js';
import { HUD } from './hud.js';

const STEP = 1 / 60;

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, t);
}

function makePlayerMesh() {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a986 });
  const shirt = new THREE.MeshLambertMaterial({ color: 0x2e86ff });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2c2f36 });
  const jacket = new THREE.MeshLambertMaterial({ color: 0x1f2a38 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.85, 0.36), shirt);
  torso.position.y = 1.05;
  torso.castShadow = true;
  group.add(torso);
  const jacketMesh = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.4), jacket);
  jacketMesh.position.y = 1.2;
  group.add(jacketMesh);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 8), skin);
  head.position.y = 1.74;
  head.castShadow = true;
  group.add(head);
  const legGeo = new THREE.BoxGeometry(0.22, 0.62, 0.24);
  const legL = new THREE.Mesh(legGeo, pants);
  legL.position.set(-0.16, 0.31, 0);
  group.add(legL);
  const legR = new THREE.Mesh(legGeo, pants);
  legR.position.set(0.16, 0.31, 0);
  group.add(legR);
  // A pistol in the right hand, visible while playing.
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.14, 0.42),
    new THREE.MeshLambertMaterial({ color: 0x141414 }),
  );
  gun.position.set(0.42, 1.0, -0.3);
  group.add(gun);
  group.userData.legL = legL;
  group.userData.legR = legR;
  return group;
}

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x8ec9ee);
    this.scene.fog = new THREE.Fog(0xa8c8e0, 220, 520);
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 900);
    this.clock = new THREE.Clock();
    this.time = 0;
    this.state = 'title';
    this.shotMode = false;
    this.scriptedInput = null;
    this.seed = 1;

    this.sound = new SoundBank();
    this.input = new Input(canvas);
    this.hud = new HUD();
    this.combat = null;
    this.city = null;
    this.traffic = null;
    this.peds = null;
    this.police = null;
    this.missions = null;
    this.parkedCars = [];

    this.player = null;
    this.playerCar = null; // {state, mesh, isMissionCar}
    this.cameraYaw = Math.PI;
    this.cameraPitch = 0.32;
    this.cash = 150;
    this.lastDamageTime = -99;
    this.lastRegenTime = 0;
    this.aiming = false;
    this.nearCar = null;
    this.nearPrompt = '';
    this.playSeconds = 0;

    this.setupLights();
    this.setupScreens();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setupLights() {
    const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x5a4a3a, 0.75);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffe0b3, 1.25);
    sun.position.set(140, 190, 90);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -180;
    sun.shadow.camera.right = 180;
    sun.shadow.camera.top = 180;
    sun.shadow.camera.bottom = -180;
    sun.shadow.camera.far = 520;
    sun.shadow.bias = -0.0006;
    this.scene.add(sun);
    this.scene.add(sun.target);
  }

  setupScreens() {
    document.getElementById('game-title').textContent = TITLE;
    document.getElementById('game-subtitle').textContent = SUBTITLE;
    document.getElementById('game-story').textContent = STORY;
    const controlsEl = document.getElementById('controls-list');
    for (const [key, action] of CONTROLS) {
      const row = document.createElement('div');
      row.className = 'control-row';
      const k = document.createElement('span');
      k.className = 'control-key';
      k.textContent = key;
      const a = document.createElement('span');
      a.textContent = action;
      row.appendChild(k);
      row.appendChild(a);
      controlsEl.appendChild(row);
    }
    const bind = (id, fn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', fn);
    };
    bind('btn-start', () => this.startGame(null));
    bind('btn-continue', () => this.startGame(loadSave()));
    bind('btn-resume', () => this.togglePause(false));
    bind('btn-save', () => this.saveGame(true));
    bind('btn-restart', () => this.startGame(null));
    bind('btn-busted-respawn', () => this.respawn('busted'));
    bind('btn-wasted-respawn', () => this.respawn('wasted'));
    bind('btn-freeroam', () => this.freeRoam());
    bind('btn-again', () => this.startGame(null));
    this.hud.setTitleButtons(!!loadSave());
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  reset(seed) {
    this.seed = seed;
    const rng = makeRng(seed);
    // Tear down the old world.
    if (this.city) {
      this.scene.remove(this.city.group);
      this.scene.remove(this.city.beacon);
    }
    if (this.traffic) for (const c of this.traffic.cars) this.scene.remove(c.mesh);
    if (this.peds) {
      for (const p of this.peds.peds) this.scene.remove(p.mesh);
      for (const d of this.peds.cashDrops) this.scene.remove(d.mesh);
    }
    if (this.police) this.police.removeAll();
    for (const pc of this.parkedCars) this.scene.remove(pc.mesh);
    this.parkedCars = [];
    if (this.player) this.scene.remove(this.player.mesh);
    if (this.playerCar) this.scene.remove(this.playerCar.mesh);

    this.city = new City(this.scene, rng);
    this.traffic = new Traffic(this.scene, this.city, rng);
    this.peds = new Pedestrians(this.scene, this.city, rng);
    this.combat = new Combat(this.scene);
    this.police = new Police(this.scene, this.city, rng, {
      onBusted: () => this.onBusted(),
      onDamage: (amount, reason) => this.damagePlayer(amount, reason),
      onWantedChange: (stars, reason) => this.onWantedChange(stars, reason),
    });
    this.missions = new MissionManager({
      onObjective: (text, place) => {
        this.city.moveBeacon(place.x, place.z);
        this.hud.toast(text, 4200);
      },
      onComplete: (mission, reward) => {
        this.cash += reward;
        this.sound.missionComplete();
        this.hud.toast(`${mission.title} complete — +$${reward}`, 4500);
        this.saveGame(false);
      },
      onAllComplete: () => this.onAllMissionsComplete(),
      onPackagePickup: () => this.police.addStars(1, 'seen with the package'),
      onHeatWave: () => {
        this.police.addStars(3, 'the job went loud');
        this.hud.toast('Three stars! Lose the cops, then reach the safehouse', 5000);
      },
      toast: (t) => this.hud.toast(t),
    });

    // The mission coupe, parked on the east avenue.
    const coupe = makeCarMesh(0x2fb8a6, false);
    coupe.position.set(PLACES.coupe.x, 0, PLACES.coupe.z);
    coupe.rotation.y = 0;
    this.scene.add(coupe);
    this.parkedCars.push({
      state: createCarState(PLACES.coupe.x, PLACES.coupe.z, 0, 0),
      mesh: coupe,
      isMissionCar: true,
    });
    // Two more parked cars to steal around town.
    for (const [x, z, color, heading] of [
      [-87, 120, 0xc23b3b, Math.PI / 2],
      [87, -137, 0xe0a83c, 0],
    ]) {
      const mesh = makeCarMesh(color, false);
      mesh.position.set(x, 0, z);
      mesh.rotation.y = heading;
      this.scene.add(mesh);
      this.parkedCars.push({
        state: createCarState(x, z, heading, 0),
        mesh,
        isMissionCar: false,
      });
    }

    const mesh = makePlayerMesh();
    this.scene.add(mesh);
    this.player = {
      mesh,
      x: 14,
      z: 14,
      heading: Math.PI,
      speed: 0,
      health: PLAYER.health,
      walkPhase: 0,
      inCar: false,
    };
    this.playerCar = null;
    this.cameraYaw = Math.PI;
    this.cameraPitch = 0.32;
    this.cash = 150;
    this.playSeconds = 0;
    this.lastDamageTime = -99;
    this.time = 0;
  }

  startGame(save) {
    this.reset(1);
    this.sound.ensure();
    if (save) {
      this.cash = save.cash;
      this.player.x = save.x;
      this.player.z = save.z;
      this.missions.resume(save.missionIndex, save.missionStep);
      this.hud.toast('Continuing your story…', 2500);
    } else {
      this.missions.start();
    }
    this.player.health = PLAYER.health;
    this.state = 'playing';
    this.hud.showScreen('none');
    this.hud.setHealth(this.player.health);
    this.hud.setCash(this.cash);
    this.hud.setStars(0);
    this.updateCamera(0);
  }

  saveGame(announce) {
    const ok = writeSave({
      cash: this.cash,
      missionIndex: this.missions.index,
      missionStep: this.missions.step,
      x: this.player.x,
      z: this.player.z,
    });
    if (announce) this.hud.toast(ok ? 'Progress saved.' : 'Save failed — storage unavailable.', 2500);
    return ok;
  }

  onWantedChange(stars, reason) {
    if (stars > 0) {
      this.sound.startSiren();
      if (reason) this.hud.toast(`Wanted: ${stars} star${stars > 1 ? 's' : ''} — ${reason}`, 3000);
    } else {
      this.sound.stopSiren();
    }
  }

  onBusted() {
    if (this.state !== 'playing') return;
    this.state = 'busted';
    this.sound.stopSiren();
    this.sound.stopEngine();
    this.sound.busted();
    const fine = Math.min(this.cash, 200);
    this.cash -= fine;
    document.getElementById('busted-fine').textContent = `The Solmar Bay PD took $${fine} and your freedom — for now.`;
    this.hud.showScreen('busted');
    if (document.pointerLockElement) document.exitPointerLock();
  }

  onWasted() {
    if (this.state !== 'playing') return;
    this.state = 'wasted';
    this.sound.stopSiren();
    this.sound.stopEngine();
    this.sound.busted();
    const fine = Math.min(this.cash, 300);
    this.cash -= fine;
    document.getElementById('wasted-fine').textContent = `Hospital bill: $${fine}. Rex lives to drive another day.`;
    this.hud.showScreen('wasted');
    if (document.pointerLockElement) document.exitPointerLock();
  }

  onAllMissionsComplete() {
    this.state = 'complete';
    this.sound.stopSiren();
    this.sound.stopEngine();
    document.getElementById('complete-stats').textContent =
      `All three jobs done. Vera is paid, the cops lost the trail, and Rex walks away with $${this.cash.toLocaleString('en-US')}.`;
    this.hud.showScreen('complete');
    if (document.pointerLockElement) document.exitPointerLock();
  }

  respawn() {
    this.police.clear();
    this.player.health = PLAYER.health;
    this.player.x = 14;
    this.player.z = 14;
    this.player.inCar = false;
    this.playerCar = null;
    this.state = 'playing';
    this.hud.showScreen('none');
    this.hud.setHealth(this.player.health);
    this.hud.setCash(this.cash);
    this.hud.setStars(0);
    this.hud.toast('Back on the streets of Solmar Bay.', 2500);
  }

  freeRoam() {
    this.city.hideBeacon();
    this.state = 'playing';
    this.hud.showScreen('none');
    this.hud.toast('Free roam — Solmar Bay is yours.', 3000);
  }

  togglePause(force) {
    if (this.state === 'playing' || force === true) {
      if (this.state !== 'playing') return;
      this.state = 'paused';
      this.hud.showScreen('pause');
      this.sound.stopEngine();
      if (document.pointerLockElement) document.exitPointerLock();
    } else if (this.state === 'paused') {
      this.state = 'playing';
      this.hud.showScreen('none');
    }
  }

  damagePlayer(amount, reason) {
    if (this.state !== 'playing') return;
    if (this.time - this.lastDamageTime < 0.6) return;
    this.lastDamageTime = this.time;
    this.player.health -= amount;
    this.hud.setHealth(this.player.health);
    if (reason) this.hud.toast(reason, 1800);
    if (this.player.health <= 0) this.onWasted();
  }

  witnessed(x, z, radius) {
    const ped = this.peds.nearest(x, z, radius, true);
    if (ped) return true;
    return this.police.nearestCarDist(x, z) < 60;
  }

  nearestEnterableCar() {
    const p = this.player;
    let best = null;
    let bestD = 4.5;
    for (const car of this.traffic.cars) {
      const d = Math.hypot(car.x - p.x, car.z - p.z);
      if (d < bestD) {
        best = { kind: 'traffic', ref: car };
        bestD = d;
      }
    }
    for (const pc of this.parkedCars) {
      const d = Math.hypot(pc.state.x - p.x, pc.state.z - p.z);
      if (d < bestD) {
        best = { kind: 'parked', ref: pc };
        bestD = d;
      }
    }
    return best;
  }

  enterCar(found) {
    const p = this.player;
    let car;
    if (found.kind === 'traffic') {
      const t = found.ref;
      this.traffic.remove(t);
      car = { state: createCarState(t.x, t.z, t.heading, 0), mesh: t.mesh, isMissionCar: false };
      if (this.witnessed(t.x, t.z, 30)) this.police.addStars(1, 'car theft witnessed');
      this.peds.scare(t.x, t.z, 12);
    } else {
      const pc = found.ref;
      const i = this.parkedCars.indexOf(pc);
      if (i >= 0) this.parkedCars.splice(i, 1);
      car = pc;
      if (!pc.isMissionCar && this.witnessed(pc.state.x, pc.state.z, 30)) {
        this.police.addStars(1, 'car theft witnessed');
      }
    }
    car.state.speed = 0;
    this.playerCar = car;
    p.inCar = true;
    this.sound.carDoor();
    this.sound.startEngine();
    this.hud.toast(car.isMissionCar ? 'The coupe is yours. Go!' : 'Car jacked. Drive!', 2000);
  }

  exitCar() {
    const p = this.player;
    const car = this.playerCar;
    const side = car.state.heading + Math.PI / 2;
    let x = car.state.x + Math.sin(side) * 3;
    let z = car.state.z + Math.cos(side) * 3;
    const res = this.city.collideCircle(x, z, PLAYER.radius);
    p.x = res.x;
    p.z = res.z;
    p.heading = car.state.heading;
    p.inCar = false;
    this.parkedCars.push(car);
    this.playerCar = null;
    this.sound.carDoor();
    this.sound.stopEngine();
  }

  // ---- per-frame update -------------------------------------------------

  update(dt) {
    this.time += dt;
    const input = this.scriptedInput || this.input;
    if (this.state === 'playing') this.playSeconds += dt;

    // Global keys.
    if (this.input.wasPressed('KeyM')) {
      const muted = this.sound.toggleMute();
      this.hud.toast(muted ? 'Sound muted (M to unmute)' : 'Sound on', 1500);
    }
    if (this.input.wasPressed('KeyP') || this.input.wasPressed('Escape')) {
      if (this.state === 'playing' || this.state === 'paused') this.togglePause();
    }
    if (this.state !== 'playing') {
      if (this.state === 'title') {
        // The title screen lives over a moving city.
        this.traffic.update(dt, null);
        this.peds.update(dt, this.time);
      }
      this.city.update(dt, this.time);
      return;
    }

    // Mouse look.
    const { dx, dy } = this.input.consumeMouse();
    this.cameraYaw -= dx * 0.0032;
    this.cameraPitch = Math.max(0.05, Math.min(0.9, this.cameraPitch + dy * 0.0022));
    if (this.input.down('KeyQ')) this.cameraYaw += dt * 2.4;

    const p = this.player;
    this.aiming = this.input.rightDown && !p.inCar;

    if (p.inCar) this.updateDriving(dt, input);
    else this.updateOnFoot(dt, input);

    // World systems.
    this.traffic.update(dt, this.playerCar ? this.playerCar.state : null);
    this.peds.update(dt, this.time);
    this.city.update(dt, this.time);
    this.combat.update(dt);
    this.police.update(dt, {
      x: p.x,
      z: p.z,
      inCar: p.inCar,
      speed: p.inCar ? Math.abs(this.playerCar.state.speed) : p.speed,
      health: p.health,
    });

    // Player car vs pedestrians: hitting one at speed is a crime.
    if (p.inCar && this.playerCar && Math.abs(this.playerCar.state.speed) > 4) {
      const car = this.playerCar.state;
      const ped = this.peds.nearest(car.x, car.z, 2.8, true);
      if (ped) {
        this.peds.damage(ped, 200, car.x, car.z);
        this.playerCar.state.speed *= 0.55;
        if (this.witnessed(car.x, car.z, 30)) this.police.addStars(1, 'hit and run');
        this.hud.toast('You hit a pedestrian!', 2000);
      }
    }
    // Traffic cars can knock the player down on foot.
    if (!p.inCar) {
      for (const car of this.traffic.cars) {
        const d = Math.hypot(car.x - p.x, car.z - p.z);
        if (d < 2.4 && car.speed > 3) {
          this.damagePlayer(12, 'Hit by traffic!');
          p.x += ((p.x - car.x) / (d || 1)) * 2;
          p.z += ((p.z - car.z) / (d || 1)) * 2;
        }
      }
    }

    // Cash pickups.
    const gained = this.peds.collectCash(p.x, p.z, 2.2);
    if (gained > 0) {
      this.cash += gained;
      this.sound.cash();
      this.hud.toast(`Picked up $${gained}`, 1500);
    }

    // Health regen after 10 quiet seconds.
    if (this.time - this.lastDamageTime > 10 && p.health > 0 && p.health < PLAYER.health) {
      p.health = Math.min(PLAYER.health, p.health + 4 * dt);
    }

    // Missions.
    const mission = this.missions.current;
    if (mission && this.missions.active) {
      this.missions.update({
        x: p.x,
        z: p.z,
        inCar: p.inCar,
        car: this.playerCar,
        nearPress: this.input.wasPressed('KeyE'),
        wanted: this.police.stars,
        distanceTo: (x, z) => Math.hypot(p.x - x, p.z - z),
      });
    }

    // HUD.
    this.hud.setHealth(p.health);
    this.hud.setCash(this.cash);
    this.hud.setStars(this.police.stars);
    this.hud.setAmmo(this.combat.ammo, PISTOL.magSize, this.combat.reloading);
    this.hud.setSpeed(p.inCar ? this.playerCar.state.speed * 3.6 : 0, p.inCar);
    const place = this.missions.markerPlace();
    if (this.missions.active && place) {
      const step = this.missions.currentStep;
      this.hud.setObjective(step.text, Math.hypot(p.x - place.x, p.z - place.z));
    } else if (this.missions.done) {
      this.hud.setObjective('Free roam — Solmar Bay is yours', null);
    }
    this.hud.showCrosshair(this.aiming || (!p.inCar && this.input.leftDown));
    this.hud.setPrompt(this.nearPrompt);
    this.hud.drawMinimap({
      playerX: p.x,
      playerZ: p.z,
      playerHeading: p.inCar ? this.playerCar.state.heading : p.heading,
      inCar: p.inCar,
      marker: this.missions.active ? place : null,
      police: [
        ...this.police.cars.map((c) => ({ x: c.state.x, z: c.state.z })),
        ...this.police.officers.map((c) => ({ x: c.x, z: c.z })),
      ],
      traffic: this.traffic.cars.map((c) => ({ x: c.x, z: c.z })),
    });

    this.updateCamera(dt);
    this.input.consumeClick();
  }

  updateOnFoot(dt, input) {
    const p = this.player;
    const mv = input.moveVector();
    const run = input.down('ShiftLeft') || input.down('ShiftRight');
    const speed = run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    // Movement relative to the camera yaw.
    const fx = -Math.sin(this.cameraYaw);
    const fz = -Math.cos(this.cameraYaw);
    const rx = -fz;
    const rz = fx;
    let mx = fx * mv.z + rx * mv.x;
    let mz = fz * mv.z + rz * mv.x;
    const len = Math.hypot(mx, mz);
    if (len > 0.01) {
      mx /= len;
      mz /= len;
      const targetHeading = Math.atan2(-mx, -mz);
      p.heading = lerpAngle(p.heading, targetHeading, dt * 12);
      p.speed = speed;
      const nx = p.x + mx * speed * dt;
      const nz = p.z + mz * speed * dt;
      const res = this.city.collideCircle(nx, nz, PLAYER.radius);
      p.x = res.x;
      p.z = res.z;
      p.walkPhase += dt * (run ? 12 : 8);
    } else {
      p.speed = 0;
    }
    p.mesh.position.set(p.x, 0, p.z);
    p.mesh.rotation.y = p.heading;
    const swing = Math.sin(p.walkPhase) * (p.speed > 0 ? 0.55 : 0);
    p.mesh.userData.legL.rotation.x = swing;
    p.mesh.userData.legR.rotation.x = -swing;

    // Enter / exit cars, pickups.
    this.nearCar = this.nearestEnterableCar();
    let prompt = '';
    if (this.nearCar) prompt = '[E] Steal car';
    const place = this.missions.markerPlace();
    const mission = this.missions.current;
    if (mission && mission.id === 'the-package' && this.missions.step === 0 && place) {
      if (Math.hypot(p.x - place.x, p.z - place.z) < 3.5) prompt = '[E] Pick up the package';
    }
    this.nearPrompt = prompt;
    if (this.nearCar && input.wasPressed('KeyE')) {
      this.enterCar(this.nearCar);
      this.nearCar = null;
      this.nearPrompt = '';
      return;
    }

    // Combat.
    if (input.wasPressed('KeyR')) this.combat.startReload();
    if (input.wasPressed('KeyF')) {
      const hit = this.combat.punch(p.x, p.z, p.heading, this.combatTargets());
      if (hit) {
        this.sound.punch();
        this.peds.scare(p.x, p.z, 20);
        if (hit.killed && this.witnessed(p.x, p.z, 30)) this.police.addStars(1, 'assault witnessed');
      }
    }
    // Clicking fires one shot even if the press is shorter than a frame;
    // holding the button keeps firing.
    const clicked = input.consumeClick();
    if ((input.leftDown || clicked) && this.combat.fireTimer <= 0 && !this.combat.reloading) {
      // The muzzle flash sits at the gun, just in front of the player.
      const headPos = new THREE.Vector3(p.x, 1.2, p.z);
      const flashDist = this.camera.position.distanceTo(headPos) + 1.0;
      const result = this.combat.shoot(this.camera, this.combatTargets(), flashDist);
      if (result && !result.empty) {
        this.sound.shot();
        this.peds.scare(p.x, p.z, 34);
        if (this.witnessed(p.x, p.z, 40)) this.police.addStars(1, 'shots fired');
        if (result.hit && result.hit.killed && this.witnessed(p.x, p.z, 30)) {
          this.police.addStars(1, 'someone saw that');
        }
      } else if (result && result.empty) {
        this.hud.toast('Reload! (R)', 1200);
      }
    }
  }

  updateDriving(dt, input) {
    const p = this.player;
    const car = this.playerCar;
    const mv = input.moveVector();
    const drive = {
      throttle: mv.z,
      steer: -mv.x,
      brake: input.down('Space'),
    };
    const otherStates = [...this.traffic.cars, ...this.police.cars.map((c) => c.state)];
    stepCar(car.state, drive, dt, this.city, otherStates);
    car.mesh.position.set(car.state.x, 0, car.state.z);
    car.mesh.rotation.y = car.state.heading;
    const spin = car.state.speed * dt * 2.4;
    for (const w of car.mesh.userData.wheels) w.rotation.x += spin;
    p.x = car.state.x;
    p.z = car.state.z;
    p.heading = car.state.heading;
    this.sound.setEngine(Math.min(1, Math.abs(car.state.speed) / CAR.maxSpeed));
    // Camera follows the car's heading.
    this.cameraYaw = lerpAngle(this.cameraYaw, car.state.heading, dt * 2.2);
    if (input.wasPressed('KeyE')) this.exitCar();
    this.nearPrompt = '[E] Exit car';
    this.nearCar = null;
  }

  combatTargets() {
    const targets = [];
    for (const ped of this.peds.peds) {
      targets.push({
        mesh: ped.mesh,
        x: ped.x,
        z: ped.z,
        alive: () => !ped.dead,
        damage: (amount, fx, fz) => this.peds.damage(ped, amount, fx, fz),
      });
    }
    for (const cop of this.police.officers) {
      targets.push({
        mesh: cop.mesh,
        x: cop.x,
        z: cop.z,
        alive: () => cop.health === undefined || cop.health > 0,
        damage: (amount) => {
          cop.health = (cop.health === undefined ? 100 : cop.health) - amount;
          if (cop.health <= 0) {
            this.scene.remove(cop.mesh);
            const i = this.police.officers.indexOf(cop);
            if (i >= 0) this.police.officers.splice(i, 1);
            return true;
          }
          return false;
        },
      });
    }
    return targets;
  }

  updateCamera(dt) {
    const p = this.player;
    if (this.state === 'title') return;
    const inCar = p.inCar;
    const dist = this.aiming ? 4.6 : inCar ? 10.5 : 7.6;
    const height = this.aiming ? 2.1 : inCar ? 4.4 : 3.4 + this.cameraPitch * 2.2;
    const back = {
      x: Math.sin(this.cameraYaw) * dist,
      z: Math.cos(this.cameraYaw) * dist,
    };
    const tx = p.x + back.x;
    const tz = p.z + back.z;
    const speed = inCar ? Math.abs(this.playerCar.state.speed) : p.speed;
    const smooth = dt > 0 ? Math.min(1, dt * (inCar ? 6 : 10)) : 1;
    this.camera.position.x += (tx - this.camera.position.x) * smooth;
    this.camera.position.y += (height - this.camera.position.y) * smooth;
    this.camera.position.z += (tz - this.camera.position.z) * smooth;
    const lookX = p.x - Math.sin(this.cameraYaw) * 2;
    const lookZ = p.z - Math.cos(this.cameraYaw) * 2;
    this.camera.lookAt(lookX, 1.7, lookZ);
    void speed;
  }

  // Fixed-step simulation used by the screenshot scenes: run the world
  // forward without real input.
  simulate(seconds, scripted) {
    this.scriptedInput = scripted || null;
    const steps = Math.round(seconds / STEP);
    for (let i = 0; i < steps; i += 1) this.update(STEP);
    this.scriptedInput = null;
  }

  // Simulate traffic and pedestrians only (title-screen backdrop).
  simulateWorld(seconds) {
    const steps = Math.round(seconds / STEP);
    for (let i = 0; i < steps; i += 1) {
      this.time += STEP;
      this.traffic.update(STEP, null);
      this.peds.update(STEP, this.time);
      this.city.update(STEP, this.time);
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  loop() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (!this.shotMode) this.update(dt);
    this.render();
    requestAnimationFrame(() => this.loop());
  }

  start() {
    this.reset(1);
    this.state = 'title';
    this.hud.showScreen('title');
    this.hud.setTitleButtons(!!loadSave());
    // Title backdrop: a high vista over the city.
    this.camera.position.set(130, 80, 130);
    this.camera.lookAt(0, 0, 0);
    this.simulateWorld(5);
    this.render();
    this.loop();
  }
}

// ---- boot ---------------------------------------------------------------

function boot() {
  const canvas = document.getElementById('game');
  const game = new Game(canvas);
  window.__game = game;
  window.addEventListener('error', (e) => {
    window.__pageError = String(e.message || e.error || 'page error');
  });
  window.addEventListener('unhandledrejection', (e) => {
    window.__pageError = String((e.reason && e.reason.message) || e.reason || 'rejection');
  });
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  const seed = Number(params.get('seed') || '1') || 1;
  game.start();
  if (shot) {
    game.shotMode = true;
    import('./shots.js').then((mod) => {
      try {
        mod.stageShot(shot, game, seed);
        game.render();
        window.__shotReady = true;
      } catch (err) {
        window.__pageError = String((err && err.message) || err);
      }
    });
  } else {
    window.__ready = true;
  }
}

boot();
