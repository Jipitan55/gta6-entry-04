// Screenshot scenes behind ?shot=start|play|end|combat&seed=N. Each one stages
// the real game from a fresh seeded world, plays it forward a fixed number of
// steps, and leaves a single frozen frame — so the same seed always gives the
// same picture, and every picture is the game itself.

// A stand-in for the real Input: fixed keys, no mouse.
function scriptedInput(move, extra) {
  return {
    moveVector: () => move,
    down: () => false,
    wasPressed: () => false,
    consumeMouse: () => ({ dx: 0, dy: 0 }),
    consumeClick: () => false,
    leftDown: !!(extra && extra.leftDown),
    rightDown: !!(extra && extra.rightDown),
  };
}

function vista(game) {
  game.state = 'title';
  game.camera.position.set(130, 80, 130);
  game.camera.lookAt(0, 0, 0);
}

export function stageShot(name, game, seed) {
  if (name === 'start') {
    game.reset(seed);
    game.state = 'title';
    game.hud.showScreen('title');
    vista(game);
    game.simulateWorld(5);
    return;
  }

  game.reset(seed);
  game.startGame(null);

  if (name === 'play') {
    // Rex on foot on the east avenue beside the turquoise coupe, traffic
    // rolling past, HUD and minimap live.
    const coupe = game.parkedCars.find((c) => c.isMissionCar);
    game.player.x = coupe.state.x;
    game.player.z = coupe.state.z + 8;
    game.player.heading = 0; // facing north, up the avenue at the coupe
    game.cameraYaw = 0;
    game.updateCamera(0);
    game.simulate(8, scriptedInput({ x: 0, z: 0 }));
    return;
  }

  if (name === 'end') {
    // A three-star chase up the east avenue: Rex in the coupe, cruisers
    // alongside and ahead, the city ahead of him.
    const coupe = game.parkedCars.find((c) => c.isMissionCar);
    game.enterCar({ kind: 'parked', ref: coupe });
    game.police.addStars(3, 'the job went loud');
    game.simulate(2, scriptedInput({ x: 0, z: 1 }));
    // Stage the cruisers into the frame: one flanking right, one ahead
    // left, one far ahead on the avenue. They are real police cars, placed
    // where the chase reads.
    const h = game.playerCar.state.heading;
    const px = game.player.x;
    const pz = game.player.z;
    const spots = [
      { dx: 5.5, dz: -8, speed: 24 },
      { dx: -5, dz: -26, speed: 22 },
      { dx: 0, dz: -44, speed: 20 },
    ];
    game.police.cars.forEach((car, i) => {
      const spot = spots[i % spots.length];
      // Offsets are in the car's forward frame: forward is (-sin h, -cos h).
      const fx = -Math.sin(h);
      const fz = -Math.cos(h);
      const rx = -fz;
      const rz = fx;
      car.state.x = px + fx * -spot.dz + rx * spot.dx;
      car.state.z = pz + fz * -spot.dz + rz * spot.dx;
      car.state.heading = h;
      car.state.speed = spot.speed;
    });
    game.simulate(0.5, scriptedInput({ x: 0, z: 1 }));
    return;
  }

  if (name === 'combat') {
    // On foot in the park, pistol out, a pedestrian fleeing a shot.
    const ped = game.peds.peds[0];
    game.player.x = ped.x - 6;
    game.player.z = ped.z + 6;
    game.player.heading = Math.atan2(-(ped.x - game.player.x), -(ped.z - game.player.z));
    game.cameraYaw = game.player.heading;
    game.updateCamera(0);
    game.simulate(1, scriptedInput({ x: 0, z: 0 }, { rightDown: true }));
    const headPos = new THREE.Vector3(game.player.x, 1.2, game.player.z);
    const flashDist = game.camera.position.distanceTo(headPos) + 1.0;
    game.combat.shoot(game.camera, game.combatTargets(), flashDist);
    game.peds.scare(game.player.x, game.player.z, 34);
    // The frozen frame keeps the aim state the simulation just had.
    game.hud.showCrosshair(true);
    game.hud.setAmmo(game.combat.ammo, 12, false);
    return;
  }

  // Unknown shot name: fall back to the title vista.
  vista(game);
  game.simulateWorld(5);
}
