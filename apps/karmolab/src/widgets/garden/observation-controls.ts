/** Shared controls for the observation-oriented garden simulations. */
export interface ObservationControls {
  element: HTMLElement;
  /** Run a base number of simulation steps, scaled by the selected speed. */
  run(baseSteps: number, step: () => void): number;
}

export function createObservationControls(): ObservationControls {
  if (!document.getElementById('garden-observation-controls-style')) {
    const style = document.createElement('style');
    style.id = 'garden-observation-controls-style';
    style.textContent = `
.garden-observation-controls{display:flex;align-items:center;gap:4px}
.garden-observation-speed{appearance:none;border:1px solid #ffffff28;background:#0b101db8;color:inherit;padding:6px 8px;border-radius:999px;cursor:pointer;font:11px var(--font-mono,monospace)}
.garden-observation-speed:focus-visible{outline:2px solid #9bdcff;outline-offset:2px}
`;
    document.head.appendChild(style);
  }
  const element = document.createElement('span');
  element.className = 'garden-observation-controls';
  const speed = document.createElement('select');
  speed.className = 'garden-observation-speed';
  speed.setAttribute('aria-label', 'Simulation speed');
  for (const value of [0.5, 1, 2, 4]) {
    const option = document.createElement('option');
    option.value = String(value);
    option.textContent = `${value}×`;
    if (value === 1) option.selected = true;
    speed.appendChild(option);
  }
  element.appendChild(speed);
  // Start with one renderable step so a half-speed simulation still has a
  // valid first frame before its accumulator begins pacing subsequent frames.
  let budget = 1;
  return {
    element,
    run(baseSteps: number, step: () => void): number {
      budget += baseSteps * Number(speed.value);
      let count = 0;
      while (budget >= 1 && count < 12) {
        step();
        budget -= 1;
        count++;
      }
      return count;
    }
  };
}
