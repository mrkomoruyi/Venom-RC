/**
 * Ref-counted press tracker.
 *
 * Tracks how many touches are active per logical button so that
 * `pressStart` returns true only on the first finger and `pressEnd`
 * returns the released button ID only when the last finger lifts.
 *
 * Extracted from MultiTouchArea so the algorithm can be unit-tested
 * independently of React Native's touch system.
 */

export interface PressTracker {
  /** Register a touch on a button. Returns `true` if this is the first touch (trigger onPressIn). */
  pressStart(touchId: string, buttonId: string): boolean;

  /** Release a touch. Returns the button ID if this was the last touch on it (trigger onPressOut), else `null`. */
  pressEnd(touchId: string): string | null;

  /** Release all touches. Returns every button ID that was actively pressed. */
  releaseAll(): string[];
}

export function createPressTracker(): PressTracker {
  const touchToButton = new Map<string, string>();
  const buttonCounts = new Map<string, number>();

  return {
    pressStart(touchId, buttonId) {
      if (touchToButton.has(touchId)) return false;
      touchToButton.set(touchId, buttonId);
      const count = buttonCounts.get(buttonId) ?? 0;
      buttonCounts.set(buttonId, count + 1);
      return count === 0;
    },

    pressEnd(touchId) {
      const buttonId = touchToButton.get(touchId);
      if (!buttonId) return null;
      touchToButton.delete(touchId);
      const remaining = (buttonCounts.get(buttonId) ?? 1) - 1;
      if (remaining <= 0) {
        buttonCounts.delete(buttonId);
        return buttonId;
      }
      buttonCounts.set(buttonId, remaining);
      return null;
    },

    releaseAll() {
      const pressed = [...buttonCounts.keys()];
      touchToButton.clear();
      buttonCounts.clear();
      return pressed;
    },
  };
}
