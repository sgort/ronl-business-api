import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { BOARDS } from './boards.config';
import { WOO_GATE_ROLE } from '../woo/modes.config';
import { INFRA_GATE_ROLE } from '../infra-board/modes.config';

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

  it("the infra-board board's role matches the gate role infra-board/modes.config.ts guards on", () => {
    const infraBoard = BOARDS.find((b) => b.id === 'infra-board');
    expect(infraBoard?.role).toBe(INFRA_GATE_ROLE);
  });

  // The Flevoland-account button on a card logs in through Entra ID, where an
  // app role becomes a realm role by a mapper in scripts/keycloak-entra-idp.json.
  // A board whose entraRole the mapper does not turn into board.role would
  // deny everyone who uses the button.
  const ENTRA_IDP = join(__dirname, '../../../../../scripts/keycloak-entra-idp.json');
  const entraRoleMap = new Map<string, string>(
    (
      JSON.parse(readFileSync(ENTRA_IDP, 'utf8')).mappers as {
        config: { [k: string]: string };
      }[]
    )
      .filter((m) => m.config.role && m.config['claim.value'])
      .map((m) => [m.config['claim.value'], m.config.role])
  );

  it.each(BOARDS.filter((b) => b.entraRole).map((b) => [b.id, b] as const))(
    "%s's Entra app role is mapped to the board's role",
    (_id, board) => {
      expect(entraRoleMap.get(board.entraRole ?? '')).toBe(board.role);
    }
  );

  it('offers the Flevoland account on every board except Woo, which has no Entra role yet', () => {
    expect(BOARDS.filter((b) => b.entraRole).map((b) => b.id)).toEqual([
      'caseworker',
      'public-affairs',
      'infra-board',
    ]);
  });
});
