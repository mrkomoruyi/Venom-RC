import { COMMANDS, Command } from '../constants/commands';

/**
 * Translate held controller regions into the one-character ESP32 protocol.
 * Contradictory inputs resolve to STOP, which is safer than choosing a wheel
 * direction arbitrarily.
 */
export function resolveDirectionCommand(activeDirections: ReadonlySet<string>): Command {
  const fwd = activeDirections.has('forward');
  const bwd = activeDirections.has('backward');
  const left = activeDirections.has('left');
  const right = activeDirections.has('right');

  if ((fwd && bwd) || (left && right)) return COMMANDS.STOP;
  if (fwd && left) return COMMANDS.FORWARD_LEFT;
  if (fwd && right) return COMMANDS.FORWARD_RIGHT;
  if (bwd && left) return COMMANDS.BACKWARD_LEFT;
  if (bwd && right) return COMMANDS.BACKWARD_RIGHT;
  if (fwd) return COMMANDS.FORWARD;
  if (bwd) return COMMANDS.BACKWARD;
  if (left) return COMMANDS.LEFT;
  if (right) return COMMANDS.RIGHT;
  return COMMANDS.STOP;
}
