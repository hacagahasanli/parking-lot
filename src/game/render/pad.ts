/**
 * A gamepad (the browser's "standard" mapping: Xbox / PlayStation layout). Read once per frame by the game; no events, no
 * buttons are bound by the player (the keyboard is rebindable, the pad has one fixed layout shown in How to play):
 *
 *   left stick: steer · RT: gas · LT: brake / reverse · A: handbrake · X: horn · Y: camera · RB / LB: shift up / down · Start: pause
 */
export interface PadState {
  steer: number;
  throttle: number;
  brake: number;
  handbrake: boolean;
  horn: boolean;
  /** Buttons by index, for edge detection (presses). */
  buttons: boolean[];
}

export const PAD = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7, back: 8, start: 9, up: 12, down: 13, left: 14, right: 15 } as const;

const DEAD = 0.18;
const dead = (v: number) => (Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD));

/** The first connected pad, or null (no pad, or a browser without the Gamepad API). */
export const readPad = (): PadState | null => {
  let pads: (Gamepad | null)[] = [];
  try {
    pads = navigator.getGamepads?.() ? Array.from(navigator.getGamepads()) : [];
  } catch {
    return null;
  }
  const p = pads.find((g) => g && g.connected);
  if (!p) return null;
  const b = (i: number) => p.buttons[i]?.value ?? 0;
  const pressed = p.buttons.map((x) => x.pressed);
  const dpad = (pressed[PAD.right] ? 1 : 0) - (pressed[PAD.left] ? 1 : 0);
  return {
    steer: Math.max(-1, Math.min(1, dead(p.axes[0] ?? 0) + dpad)),
    throttle: b(PAD.rt),
    brake: b(PAD.lt),
    handbrake: pressed[PAD.a] ?? false,
    horn: pressed[PAD.x] ?? false,
    buttons: pressed,
  };
};
