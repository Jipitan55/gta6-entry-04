// Keyboard and mouse state. Mouse look works two ways: pointer lock when the
// player clicks the canvas, and drag-to-orbit as a fallback (and for headless
// captures, where pointer lock is unavailable).

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.leftDown = false;
    this.leftClicked = false;
    this.rightDown = false;
    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;
    this.locked = false;
    this.pressed = new Set(); // edge-triggered keys, consumed by the game

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.leftDown = false;
      this.rightDown = false;
      this.dragging = false;
    });

    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.leftDown = true;
        this.leftClicked = true;
      }
      if (e.button === 2) this.rightDown = true;
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      if (document.pointerLockElement !== canvas) {
        try {
          canvas.requestPointerLock();
        } catch {
          // pointer lock unavailable; drag still works
        }
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.leftDown = false;
      if (e.button === 2) this.rightDown = false;
      this.dragging = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    document.addEventListener('mousemove', (e) => {
      if (this.locked) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      } else if (this.dragging) {
        this.mouseDX += e.clientX - this.lastX;
        this.mouseDY += e.clientY - this.lastY;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
      }
    });
  }

  down(code) {
    return this.keys.has(code);
  }

  // True once per physical press; the game consumes it.
  wasPressed(code) {
    if (this.pressed.has(code)) {
      this.pressed.delete(code);
      return true;
    }
    return false;
  }

  consumeMouse() {
    const dx = this.mouseDX;
    const dy = this.mouseDY;
    this.mouseDX = 0;
    this.mouseDY = 0;
    return { dx, dy };
  }

  consumeClick() {
    const c = this.leftClicked;
    this.leftClicked = false;
    return c;
  }

  // Forward / strafe / brake in camera space, -1..1.
  moveVector() {
    let x = 0;
    let z = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) z += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) z -= 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    return { x, z };
  }
}
