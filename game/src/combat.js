// Combat: the pistol (hit-scan raycast with a tracer and muzzle flash) and the
// punch (short-range, knocks the target back). Targets are pedestrians and
// police officers; the raycaster tests their meshes.

import { PISTOL, PLAYER } from './config.js';

export class Combat {
  constructor(scene) {
    this.scene = scene;
    this.raycaster = new THREE.Raycaster();
    this.ammo = PISTOL.magSize;
    this.reloadTimer = 0;
    this.fireTimer = 0;
    this.punchTimer = 0;
    this.tracers = [];
    this.flash = null;
    this.flashTimer = 0;
  }

  get reloading() {
    return this.reloadTimer > 0;
  }

  startReload() {
    if (this.ammo < PISTOL.magSize && this.reloadTimer <= 0) {
      this.reloadTimer = PISTOL.reloadSeconds;
      return true;
    }
    return false;
  }

  // Fire from the camera through the crosshair. `targets` is a list of
  // {mesh, x, z, damage(amount, x, z), alive} entries. `flashDist` is how far
  // along the shot the muzzle flash sits (about the gun's distance from the
  // camera). Returns what was hit.
  shoot(camera, targets, flashDist) {
    if (this.fireTimer > 0 || this.reloadTimer > 0) return null;
    if (this.ammo <= 0) {
      this.startReload();
      return { empty: true };
    }
    this.ammo -= 1;
    this.fireTimer = PISTOL.fireCooldown;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    dir.x += (Math.random() - 0.5) * PISTOL.spread * 2;
    dir.y += (Math.random() - 0.5) * PISTOL.spread * 2;
    dir.normalize();
    this.raycaster.set(camera.position, dir);
    this.raycaster.far = PISTOL.range;
    const meshes = targets.filter((t) => t.alive()).map((t) => t.mesh);
    const hits = this.raycaster.intersectObjects(meshes, true);
    const origin = camera.position.clone();
    let end = origin.clone().add(dir.clone().multiplyScalar(PISTOL.range));
    let hitTarget = null;
    if (hits.length > 0) {
      end = hits[0].point.clone();
      let obj = hits[0].object;
      while (obj.parent && !targets.some((t) => t.mesh === obj)) obj = obj.parent;
      hitTarget = targets.find((t) => t.mesh === obj) || null;
      if (hitTarget) {
        const killed = hitTarget.damage(PISTOL.damage, origin.x, origin.z);
        hitTarget.killed = killed;
      }
    }
    this.spawnTracer(origin, end);
    // The flash sits just past the muzzle, not against the camera lens.
    this.spawnFlash(origin.clone().add(dir.clone().multiplyScalar(flashDist || 2.4)));
    return { hit: hitTarget, point: end };
  }

  spawnTracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 }),
    );
    this.scene.add(line);
    this.tracers.push({ line, life: 0.08 });
  }

  spawnFlash(pos) {
    if (!this.flash) {
      this.flash = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.85 }),
      );
      this.scene.add(this.flash);
    }
    this.flash.position.copy(pos);
    this.flash.visible = true;
    this.flashTimer = 0.05;
  }

  // Melee: the nearest living target inside punch range takes damage and is
  // knocked back. Returns the target hit, if any.
  punch(playerX, playerZ, heading, targets) {
    if (this.punchTimer > 0) return null;
    this.punchTimer = PLAYER.punchCooldown;
    const fx = -Math.sin(heading);
    const fz = -Math.cos(heading);
    let best = null;
    let bestD = PLAYER.punchRange;
    for (const t of targets) {
      if (!t.alive()) continue;
      const dx = t.x - playerX;
      const dz = t.z - playerZ;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < bestD && (dx * fx + dz * fz) / (d || 1) > 0.3) {
        best = t;
        bestD = d;
      }
    }
    if (best) {
      const killed = best.damage(PLAYER.punchDamage, playerX, playerZ);
      best.killed = killed;
      const dx = best.x - playerX;
      const dz = best.z - playerZ;
      const d = Math.sqrt(dx * dx + dz * dz) || 1;
      best.x += (dx / d) * 1.6;
      best.z += (dz / d) * 1.6;
      if (best.mesh) {
        best.mesh.position.x = best.x;
        best.mesh.position.z = best.z;
      }
    }
    return best;
  }

  update(dt) {
    this.fireTimer = Math.max(0, this.fireTimer - dt);
    this.punchTimer = Math.max(0, this.punchTimer - dt);
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) this.ammo = PISTOL.magSize;
    }
    for (let i = this.tracers.length - 1; i >= 0; i -= 1) {
      const t = this.tracers[i];
      t.life -= dt;
      if (t.life <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        this.tracers.splice(i, 1);
      }
    }
    if (this.flash) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.flash.visible = false;
    }
  }
}
