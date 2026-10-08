import {
  EDOCS_AUTHOR_VARIABLES,
  edocsAuthorFrom,
  edocsAuthorVariables,
  withoutEdocsAuthor,
} from './edocs-author';

const staff = { roles: ['caseworker'] };

describe('edocsAuthorVariables', () => {
  it('stamps the e-mail and the display name of a member of staff', () => {
    expect(
      edocsAuthorVariables({ ...staff, email: 'a@flevoland.nl', displayName: 'An Example' })
    ).toEqual({
      edocsAuthor: { value: 'a@flevoland.nl', type: 'String' },
      edocsAuthorName: { value: 'An Example', type: 'String' },
    });
  });

  it('falls back to preferred_username, and leaves the name out when there is none', () => {
    expect(edocsAuthorVariables({ ...staff, preferredUsername: 'test-caseworker' })).toEqual({
      edocsAuthor: { value: 'test-caseworker', type: 'String' },
    });
  });

  // Keycloak's tokens carry given_name/family_name but often no `name` claim
  // (seen live, 8 October 2026): the archive still names the person.
  it('falls back to the given and family name when the token has no display name', () => {
    expect(
      edocsAuthorVariables({
        ...staff,
        email: 'steven.gort@ictu.nl',
        givenName: 'Infra Medewerker',
        familyName: 'Flevoland',
      })
    ).toEqual({
      edocsAuthor: { value: 'steven.gort@ictu.nl', type: 'String' },
      edocsAuthorName: { value: 'Infra Medewerker Flevoland', type: 'String' },
    });
  });

  it('records no name from a given name alone, which may be a split username', () => {
    expect(
      edocsAuthorVariables({ ...staff, email: 'a@flevoland.nl', givenName: 'a@flevoland.nl' })
    ).toEqual({ edocsAuthor: { value: 'a@flevoland.nl', type: 'String' } });
  });

  it('stamps nothing for a citizen', () => {
    expect(
      edocsAuthorVariables({
        roles: ['citizen'],
        email: 'c@example.nl',
        preferredUsername: '999993653',
      })
    ).toEqual({});
  });

  it('stamps nothing when the token names nobody', () => {
    expect(edocsAuthorVariables({ ...staff, email: '', preferredUsername: undefined })).toEqual({});
  });
});

describe('edocsAuthorFrom', () => {
  it('reads the author from Operaton variables', () => {
    expect(
      edocsAuthorFrom({
        edocsAuthor: { value: 'a@flevoland.nl' },
        edocsAuthorName: { value: 'An Example' },
      })
    ).toEqual({ email: 'a@flevoland.nl', name: 'An Example' });
  });

  it('is undefined without edocsAuthor, or when it is not a non-empty string', () => {
    expect(edocsAuthorFrom({})).toBeUndefined();
    expect(edocsAuthorFrom({ edocsAuthor: { value: '' } })).toBeUndefined();
    expect(edocsAuthorFrom({ edocsAuthor: { value: 42 } })).toBeUndefined();
  });

  it('ignores a name that is not a string', () => {
    expect(
      edocsAuthorFrom({ edocsAuthor: { value: 'a@b.nl' }, edocsAuthorName: { value: null } })
    ).toEqual({ email: 'a@b.nl' });
  });

  it('names exactly the two variables', () => {
    expect(EDOCS_AUTHOR_VARIABLES).toEqual(['edocsAuthor', 'edocsAuthorName']);
  });
});

describe('withoutEdocsAuthor', () => {
  it('leaves out the author variables and keeps everything else', () => {
    expect(
      withoutEdocsAuthor({ edocsAuthor: 'a@b.nl', edocsAuthorName: 'An', decision: 'granted' })
    ).toEqual({ decision: 'granted' });
  });
});
