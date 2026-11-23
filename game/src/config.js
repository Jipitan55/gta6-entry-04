// SOLMAR HEAT — every tuning number, colour and story line in one place.
// The city is a 5x5 grid of blocks separated by roads; the centre block is a park.

export const TITLE = 'SOLMAR HEAT';
export const SUBTITLE = 'An open-world crime story in Solmar Bay';
export const SAVE_KEY = 'solmar-heat-save-v1';

export const CITY = {
  grid: 5, // blocks per side
  block: 44, // block side length
  road: 14, // road width
  pitch: 58, // block + road
  half: 152, // half the city side length
  // Road centre lines (avenues run north-south, streets east-west).
  roads: [-145, -87, -29, 29, 87, 145],
  blockCentres: [-116, -58, 0, 58, 116],
};

// Named places, all on or beside roads so missions stay reachable.
export const PLACES = {
  coupe: { x: 142, z: -58, label: 'Turquoise coupe' },
  garage: { x: -29, z: 137, label: "Vera's garage" },
  pier: { x: 145, z: 58, label: 'Pier courier' },
  bar: { x: -145, z: 29, label: 'Neon Bar' },
  safehouse: { x: 29, z: -145, label: 'Safehouse' },
  park: { x: 0, z: 0, label: 'Central Park' },
  hospital: { x: -58, z: 116, label: 'Clinic' },
};

export const PLAYER = {
  walkSpeed: 6,
  runSpeed: 9.5,
  accel: 40,
  radius: 0.9,
  health: 100,
  punchRange: 2.4,
  punchDamage: 30,
  punchCooldown: 0.45,
};

export const PISTOL = {
  damage: 34,
  range: 90,
  magSize: 12,
  reloadSeconds: 1.4,
  fireCooldown: 0.22,
  spread: 0.012,
};

export const CAR = {
  accel: 20,
  brake: 34,
  reverseAccel: 14,
  maxSpeed: 31,
  maxReverse: 11,
  steerMax: 0.62,
  drag: 0.35,
  radius: 2.3,
};

export const TRAFFIC = {
  count: 14,
  speedMin: 9,
  speedMax: 14,
};

export const PEDS = { count: 22 };

export const WANTED = {
  maxStars: 5,
  decaySeconds: 5, // out of police range this long loses one star
  decayRange: 48,
  bustDistance: 4.2,
  bustSeconds: 2.2,
  fineBusted: 200,
  fineWasted: 300,
};

export const MISSIONS = [
  {
    id: 'hot-wheels',
    title: 'Mission 1 — Hot Wheels',
    briefing:
      'Vera needs wheels. Steal the turquoise coupe parked on the east avenue and bring it to her garage.',
    steps: [
      { text: 'Steal the turquoise coupe on the east avenue', marker: 'coupe' },
      { text: "Drive the coupe to Vera's garage", marker: 'garage' },
    ],
    reward: 800,
  },
  {
    id: 'the-package',
    title: 'Mission 2 — The Package',
    briefing:
      'A courier waits at the pier with a package for the Neon Bar. Pick it up on foot — and keep your head down.',
    steps: [
      { text: 'Meet the courier at the pier (on foot, press E)', marker: 'pier' },
      { text: 'Deliver the package to the Neon Bar', marker: 'bar' },
    ],
    reward: 1200,
  },
  {
    id: 'heat-wave',
    title: 'Mission 3 — Heat Wave',
    briefing:
      'The job went loud. Three stars and every unit in Solmar Bay is coming. Lose the cops, then reach the safehouse.',
    steps: [
      { text: 'Lose the cops, then reach the safehouse', marker: 'safehouse' },
    ],
    reward: 2000,
  },
];

export const STORY =
  'Solmar Bay, 6:40 on a summer evening. Rex Marlowe is back in the city that ran him out three years ago, ' +
  'broke, with one name in his phone: Vera Kline, fixer, fence, and the only person in town who still answers. ' +
  'She has work. It pays. And in Solmar Bay, work like this always ends with sirens.';

export const CONTROLS = [
  ['W A S D', 'Move / drive'],
  ['Shift', 'Sprint'],
  ['Mouse', 'Look (click to lock, drag to orbit)'],
  ['Left click', 'Shoot pistol'],
  ['Right click (hold)', 'Aim'],
  ['F', 'Punch'],
  ['E', 'Enter / exit car · pick up'],
  ['R', 'Reload'],
  ['M', 'Mute sound'],
  ['P / Esc', 'Pause'],
];

export const PALETTE = {
  sky: 0x8ec9ee,
  fog: 0xa8c8e0,
  sun: 0xffe0b3,
  ground: 0x3d3a35,
  sidewalk: 0x8d8a82,
  road: 0x2e2e33,
  roadLine: 0xd8d23a,
  park: 0x4d7a45,
  building: [0xc9a06a, 0x9fb4c7, 0xb98a7a, 0x7a8ba0, 0xd0b48a, 0x8a9a7a, 0xc77b5e, 0x6a7a8c],
  glass: 0x2c3e50,
  lamp: 0xffe9a8,
  tree: 0x3f6b34,
  trunk: 0x6b4a2f,
  player: 0x2e86ff,
  ped: [0xd94f4f, 0x4fd97a, 0xe0a83c, 0x9a6fd0, 0x3cc7d4, 0xe07ab0],
  policeCar: 0x1c2733,
  policeLight: 0xff2a2a,
  cop: 0x1c2733,
  beacon: 0xffd23c,
  hud: '#eef1f5',
  hudMuted: '#9aa3ad',
  star: '#ffd23c',
  danger: '#ff4d4d',
  cash: '#7be382',
};
