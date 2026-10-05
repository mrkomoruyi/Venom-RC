/**
 * MultiTouchArea — Single parent that captures ALL touch events and
 * dispatches press/release callbacks to registered button regions.
 *
 * React Native's Responder system only allows ONE active responder across
 * the entire app at any time. This means PanResponder / Pressable / TouchableOpacity
 * on sibling Views CANNOT be pressed simultaneously.
 *
 * This component solves the problem by:
 *   1. Becoming the responder so no child can claim it (blocking Pressable etc.)
 *   2. Using raw onTouchStart / onTouchEnd events on the View, which fire for
 *      EVERY finger regardless of responder status, and include all changedTouches.
 *   3. Each button registers its View ref via registerButton(id, ref, ...).
 *   4. On every touch start, we measure all button positions and hit-test.
 *   5. We track which button each touch-identifier is on, and fire callbacks.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useMemo,
  useEffect,
} from 'react';
import { createPressTracker } from '../utils/pressTracker';
import {
  View,
  ViewStyle,
  findNodeHandle,
  UIManager,
  NativeTouchEvent,
} from 'react-native';

// ── Types ──────────────────────────────────────────────────────────
interface ButtonRegion {
  ref: React.RefObject<View | null>;
  onPressIn: () => void;
  onPressOut: () => void;
  // Cached layout from the most recent measure
  layout: { x: number; y: number; width: number; height: number } | null;
}

interface MultiTouchContextValue {
  registerButton: (
    id: string,
    ref: React.RefObject<View | null>,
    onPressIn: () => void,
    onPressOut: () => void,
  ) => void;
  unregisterButton: (id: string) => void;
}

const MultiTouchContext = createContext<MultiTouchContextValue | null>(null);

export function useMultiTouch() {
  const ctx = useContext(MultiTouchContext);
  if (!ctx) {
    throw new Error('useMultiTouch must be used within <MultiTouchArea>');
  }
  return ctx;
}

// ── Component ──────────────────────────────────────────────────────
interface MultiTouchAreaProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

export function MultiTouchArea({ children, style }: MultiTouchAreaProps) {
  // Registered buttons keyed by ID
  const buttonsRef = useRef<Map<string, ButtonRegion>>(new Map());

  // Ref-counted tracker: maps touch identifiers to button IDs and
  // ensures onPressIn fires on the first finger, onPressOut on the last.
  const trackerRef = useRef(createPressTracker());

  // Whether we have fresh measurements (invalidated on layout change)
  const measuredRef = useRef(false);

  // Ref to the container View for measuring its offset
  const containerRef = useRef<View>(null);

  // ── Registration API ──────────────────────────────────────────
  const registerButton = useCallback(
    (
      id: string,
      ref: React.RefObject<View | null>,
      onPressIn: () => void,
      onPressOut: () => void,
    ) => {
      buttonsRef.current.set(id, { ref, onPressIn, onPressOut, layout: null });
      // Invalidate measurements so we re-measure on next touch
      measuredRef.current = false;
    },
    [],
  );

  const unregisterButton = useCallback((id: string) => {
    buttonsRef.current.delete(id);
  }, []);

  const contextValue = useMemo(
    () => ({ registerButton, unregisterButton }),
    [registerButton, unregisterButton],
  );

  // ── Layout measurement ────────────────────────────────────────
  /**
   * Measure all registered buttons synchronously using measureInWindow.
   * This gives us absolute screen coordinates which we can compare against
   * touch pageX/pageY.
   */
  const measureAllButtons = useCallback((): Promise<void> => {
    const promises: Promise<void>[] = [];

    buttonsRef.current.forEach((btn) => {
      const node = btn.ref.current;
      if (!node) return;
      const handle = findNodeHandle(node);
      if (!handle) return;

      promises.push(
        new Promise<void>((resolve) => {
          UIManager.measureInWindow(handle, (x, y, width, height) => {
            btn.layout = { x, y, width, height };
            resolve();
          });
        }),
      );
    });

    return Promise.all(promises).then(() => {
      measuredRef.current = true;
    });
  }, []);

  /** Hit-test a page coordinate against all registered buttons. */
  const hitTest = useCallback(
    (pageX: number, pageY: number): string | null => {
      for (const [id, btn] of buttonsRef.current) {
        const l = btn.layout;
        if (!l) continue;
        if (
          pageX >= l.x &&
          pageX <= l.x + l.width &&
          pageY >= l.y &&
          pageY <= l.y + l.height
        ) {
          return id;
        }
      }
      return null;
    },
    [],
  );

  // ── Touch event processing ────────────────────────────────────
  const processStarts = useCallback(
    (touches: NativeTouchEvent[]) => {
      for (const touch of touches) {
        const buttonId = hitTest(touch.pageX, touch.pageY);
        if (buttonId) {
          const isFirst = trackerRef.current.pressStart(
            String(touch.identifier),
            buttonId,
          );
          if (isFirst) buttonsRef.current.get(buttonId)?.onPressIn();
        }
      }
    },
    [hitTest],
  );

  const processEnds = useCallback((touches: NativeTouchEvent[]) => {
    for (const touch of touches) {
      const released = trackerRef.current.pressEnd(String(touch.identifier));
      if (released) buttonsRef.current.get(released)?.onPressOut();
    }
  }, []);

  const releaseAllTouches = useCallback(() => {
    for (const buttonId of trackerRef.current.releaseAll()) {
      buttonsRef.current.get(buttonId)?.onPressOut();
    }
  }, []);

  useEffect(() => releaseAllTouches, [releaseAllTouches]);

  // ── Raw touch event handlers ──────────────────────────────────
  // These fire for EVERY finger on Android and iOS, unlike the responder
  // callbacks which only get the primary touch.
  const handleTouchStart = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (e: any) => {
      const nativeEvent = e.nativeEvent;
      const changedTouches: NativeTouchEvent[] =
        nativeEvent.changedTouches || [nativeEvent];

      if (!measuredRef.current) {
        // Measure first, then process touches after measurement completes
        measureAllButtons().then(() => {
          processStarts(changedTouches);
        });
      } else {
        processStarts(changedTouches);
      }
    },
    [measureAllButtons, processStarts],
  );

  const handleTouchEnd = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (e: any) => {
      const nativeEvent = e.nativeEvent;
      const changedTouches: NativeTouchEvent[] =
        nativeEvent.changedTouches || [nativeEvent];
      processEnds(changedTouches);
    },
    [processEnds],
  );

  const handleLayout = useCallback(() => {
    // Re-measure on layout changes
    measuredRef.current = false;
    measureAllButtons();
  }, [measureAllButtons]);

  return (
    <MultiTouchContext.Provider value={contextValue}>
      <View
        ref={containerRef}
        style={style}
        onLayout={handleLayout}
        // Claim the responder to prevent children from grabbing it,
        // but we don't actually use the responder callbacks for touch data.
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => false}
        onResponderTerminationRequest={() => false}
        onResponderTerminate={releaseAllTouches}
        // Raw touch events — these fire for ALL fingers
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        {children}
      </View>
    </MultiTouchContext.Provider>
  );
}
