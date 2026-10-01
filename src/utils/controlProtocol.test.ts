import { COMMANDS } from '../constants/commands';
import { resolveDirectionCommand } from './controlProtocol';

describe('resolveDirectionCommand', () => {
  it.each([
    [[], COMMANDS.STOP],
    [['forward'], COMMANDS.FORWARD],
    [['backward'], COMMANDS.BACKWARD],
    [['left'], COMMANDS.LEFT],
    [['right'], COMMANDS.RIGHT],
    [['forward', 'left'], COMMANDS.FORWARD_LEFT],
    [['forward', 'right'], COMMANDS.FORWARD_RIGHT],
    [['backward', 'left'], COMMANDS.BACKWARD_LEFT],
    [['backward', 'right'], COMMANDS.BACKWARD_RIGHT],
    [['forward', 'backward'], COMMANDS.STOP],
    [['left', 'right'], COMMANDS.STOP],
  ])('maps %p to %s', (directions, expected) => {
    expect(resolveDirectionCommand(new Set(directions))).toBe(expected);
  });
});
