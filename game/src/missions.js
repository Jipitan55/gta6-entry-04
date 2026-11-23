// Missions and story: a chain of three jobs from the fixer Vera Kline.
// Each mission has steps with a marker place; the manager watches the player's
// position and car and fires events the game turns into rewards and toasts.

import { MISSIONS, PLACES } from './config.js';

export class MissionManager {
  constructor(callbacks) {
    this.cb = callbacks; // {onObjective, onComplete, onAllComplete, toast}
    this.index = 0;
    this.step = 0;
    this.active = false;
    this.done = false;
    this.packageHeld = false;
    this.heatSet = false;
  }

  get current() {
    return MISSIONS[this.index] || null;
  }

  get currentStep() {
    const m = this.current;
    return m ? m.steps[this.step] : null;
  }

  start() {
    this.index = 0;
    this.step = 0;
    this.active = true;
    this.done = false;
    this.packageHeld = false;
    this.heatSet = false;
    this.announce();
  }

  // Resume from a save (mission index + step). An index past the last mission
  // means the story is finished: free roam, no replay, no second reward.
  resume(index, step) {
    if (index >= MISSIONS.length) {
      this.index = MISSIONS.length;
      this.step = 0;
      this.active = false;
      this.done = true;
      this.packageHeld = false;
      this.heatSet = false;
      return;
    }
    this.index = index;
    this.step = step || 0;
    this.active = true;
    this.done = false;
    this.packageHeld = this.index === 1 && this.step === 1;
    this.heatSet = this.index === 2;
    this.announce();
  }

  announce() {
    const step = this.currentStep;
    if (!step) return;
    const place = PLACES[step.marker];
    if (this.cb.onObjective) this.cb.onObjective(step.text, place);
  }

  markerPlace() {
    const step = this.currentStep;
    return step ? PLACES[step.marker] : null;
  }

  completeStep() {
    const mission = this.current;
    if (!mission) return;
    this.step += 1;
    if (this.step >= mission.steps.length) {
      const reward = mission.reward;
      this.index += 1;
      this.step = 0;
      this.packageHeld = false;
      this.heatSet = false;
      if (this.cb.onComplete) this.cb.onComplete(mission, reward);
      if (this.index >= MISSIONS.length) {
        this.active = false;
        this.done = true;
        if (this.cb.onAllComplete) this.cb.onAllComplete();
      } else {
        this.announce();
      }
    } else {
      this.announce();
    }
  }

  // Called every frame with the live game state; returns nothing, fires events.
  update(ctx) {
    // ctx: {x, z, inCar, car, nearPress, distanceTo(x, z)}
    if (!this.active || this.done) return;
    const mission = this.current;
    if (!mission) return;
    const place = this.markerPlace();
    if (!place) return;
    const d = ctx.distanceTo(place.x, place.z);

    if (mission.id === 'hot-wheels') {
      if (this.step === 0) {
        // Step 0 completes when the player gets into the marked coupe.
        if (ctx.inCar && ctx.car && ctx.car.isMissionCar) this.completeStep();
      } else if (d < 7 && ctx.inCar) {
        this.completeStep();
      }
    } else if (mission.id === 'the-package') {
      if (this.step === 0) {
        if (d < 3.5 && !ctx.inCar && ctx.nearPress) {
          this.packageHeld = true;
          if (this.cb.toast) this.cb.toast('Package collected — get it to the Neon Bar');
          this.completeStep();
          if (this.cb.onPackagePickup) this.cb.onPackagePickup();
        }
      } else if (d < 5) {
        this.completeStep();
      }
    } else if (mission.id === 'heat-wave') {
      if (!this.heatSet) {
        this.heatSet = true;
        if (this.cb.onHeatWave) this.cb.onHeatWave();
      }
      if (d < 8 && ctx.wanted === 0) this.completeStep();
    }
  }
}
