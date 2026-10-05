import { createPressTracker } from './pressTracker';

describe('createPressTracker', () => {
  it('returns true on first touch, false on subsequent touches to the same button', () => {
    const tracker = createPressTracker();
    expect(tracker.pressStart('t1', 'forward')).toBe(true);
    expect(tracker.pressStart('t2', 'forward')).toBe(false);
  });

  it('fires pressOut only when the last finger lifts', () => {
    const tracker = createPressTracker();
    tracker.pressStart('t1', 'forward');
    tracker.pressStart('t2', 'forward');
    expect(tracker.pressEnd('t1')).toBeNull();      // second finger still holding
    expect(tracker.pressEnd('t2')).toBe('forward');  // last finger lifted
  });

  it('tracks different buttons independently', () => {
    const tracker = createPressTracker();
    expect(tracker.pressStart('t1', 'forward')).toBe(true);
    expect(tracker.pressStart('t2', 'left')).toBe(true);
    expect(tracker.pressEnd('t1')).toBe('forward');
    expect(tracker.pressEnd('t2')).toBe('left');
  });

  it('ignores duplicate pressStart for the same touch identifier', () => {
    const tracker = createPressTracker();
    expect(tracker.pressStart('t1', 'forward')).toBe(true);
    expect(tracker.pressStart('t1', 'left')).toBe(false);   // same touch, ignored
    expect(tracker.pressEnd('t1')).toBe('forward');          // still mapped to original
  });

  it('returns null for unknown touch ends', () => {
    const tracker = createPressTracker();
    expect(tracker.pressEnd('t99')).toBeNull();
  });

  it('releaseAll returns all actively pressed buttons', () => {
    const tracker = createPressTracker();
    tracker.pressStart('t1', 'forward');
    tracker.pressStart('t2', 'left');
    tracker.pressStart('t3', 'forward'); // second finger on forward
    const released = tracker.releaseAll();
    expect(released).toHaveLength(2);
    expect(released).toContain('forward');
    expect(released).toContain('left');
  });

  it('clears all state after releaseAll', () => {
    const tracker = createPressTracker();
    tracker.pressStart('t1', 'forward');
    tracker.releaseAll();
    // A new press should be treated as the first touch
    expect(tracker.pressStart('t2', 'forward')).toBe(true);
    // The old touch should be unknown
    expect(tracker.pressEnd('t1')).toBeNull();
  });

  it('handles interleaved presses and releases across buttons', () => {
    const tracker = createPressTracker();
    tracker.pressStart('t1', 'forward');
    tracker.pressStart('t2', 'left');
    tracker.pressStart('t3', 'forward');
    expect(tracker.pressEnd('t1')).toBeNull();      // forward still held by t3
    expect(tracker.pressEnd('t2')).toBe('left');     // left fully released
    expect(tracker.pressEnd('t3')).toBe('forward');  // forward fully released
  });
});
