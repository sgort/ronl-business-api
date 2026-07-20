import { describe, expect, it } from 'vitest';
import { BOARDS } from './boards.config';
import { WOO_GATE_ROLE } from '../woo/modes.config';

describe('login-choice boards.config', () => {
  it('lists exactly the four dashboards, each with a unique id', () => {
    expect(BOARDS.map((b) => b.id)).toEqual(['caseworker', 'public-affairs', 'infra-board', 'woo']);
    expect(new Set(BOARDS.map((b) => b.id)).size).toBe(BOARDS.length);
  });

  it('routes every board to /dashboard/<id>', () => {
    for (const board of BOARDS) {
      expect(board.route).toBe(`/dashboard/${board.id}`);
    }
  });

  it('assigns a unique test user per board', () => {
    expect(new Set(BOARDS.map((b) => b.testUser)).size).toBe(BOARDS.length);
  });

  it("the woo board's role matches the gate role woo/modes.config.ts guards on", () => {
    const wooBoard = BOARDS.find((b) => b.id === 'woo');
    expect(wooBoard?.role).toBe(WOO_GATE_ROLE);
  });
});
