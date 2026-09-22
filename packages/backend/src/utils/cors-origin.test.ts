import { corsOriginCallback, isAllowedOrigin } from './cors-origin';

/**
 * Unit tests for the CORS origin decision.
 *
 * #37: a pull request's Static Web Apps preview gets an ephemeral origin that is
 * not in CORS_ORIGIN, so a preview could only ever demonstrate that static pages
 * render — every call to the backend was refused. Preview origins cannot be
 * pre-listed, because there is a new one per pull request.
 *
 * The allowance is deliberately narrow. Azure derives a preview hostname from
 * the app's STABLE slug, confirmed against live previews on a neighbouring app:
 *
 *   brave-bay-04f351e03-117.westeurope.4.azurestaticapps.net   preview for PR 117
 *   brave-bay-04f351e03.4.azurestaticapps.net                  that app's default
 *
 * so matching on the slug admits this project's numbered previews and nothing
 * else on azurestaticapps.net. `*.azurestaticapps.net` would have let anyone's
 * Static Web App make credentialed requests to the tier.
 */

const ACC_ORIGINS = ['https://acc.mijn.open-regels.nl', 'https://acc.publiek.open-regels.nl'];
const SLUGS = ['ashy-pebble-0d80dbe03', 'red-river-0ce4c9803', 'calm-water-068f8b303'];

describe('isAllowedOrigin', () => {
  describe('the configured origins', () => {
    it('allows an exactly listed origin', () => {
      expect(isAllowedOrigin('https://acc.mijn.open-regels.nl', ACC_ORIGINS, [], false)).toBe(true);
    });

    it('refuses an origin that is not listed', () => {
      expect(isAllowedOrigin('https://example.test', ACC_ORIGINS, [], false)).toBe(false);
    });

    it('refuses a listed host over the wrong scheme', () => {
      expect(isAllowedOrigin('http://acc.mijn.open-regels.nl', ACC_ORIGINS, [], false)).toBe(false);
    });
  });

  describe('preview origins', () => {
    it('allows a numbered preview of a listed app', () => {
      expect(
        isAllowedOrigin(
          'https://ashy-pebble-0d80dbe03-181.westeurope.1.azurestaticapps.net',
          ACC_ORIGINS,
          SLUGS,
          false
        )
      ).toBe(true);
    });

    it('allows each of the three apps', () => {
      for (const slug of SLUGS) {
        expect(
          isAllowedOrigin(
            `https://${slug}-7.westeurope.4.azurestaticapps.net`,
            ACC_ORIGINS,
            SLUGS,
            false
          )
        ).toBe(true);
      }
    });

    it("refuses another tenant's Static Web App", () => {
      // The reason this matches on the slug rather than the domain: the domain
      // is shared by every Static Web App in the world.
      expect(
        isAllowedOrigin(
          'https://someone-elses-app-1.westeurope.1.azurestaticapps.net',
          ACC_ORIGINS,
          SLUGS,
          false
        )
      ).toBe(false);
    });

    it('refuses a slug that merely starts the same', () => {
      expect(
        isAllowedOrigin(
          'https://ashy-pebble-0d80dbe03evil-1.westeurope.1.azurestaticapps.net',
          ACC_ORIGINS,
          SLUGS,
          false
        )
      ).toBe(false);
    });

    it('refuses the app default hostname, which carries no environment number', () => {
      // The default host is the tier itself, not a preview. It belongs in
      // CORS_ORIGIN if it belongs anywhere.
      expect(
        isAllowedOrigin(
          'https://ashy-pebble-0d80dbe03.1.azurestaticapps.net',
          ACC_ORIGINS,
          SLUGS,
          false
        )
      ).toBe(false);
    });

    it('refuses a non-numeric environment', () => {
      expect(
        isAllowedOrigin(
          'https://ashy-pebble-0d80dbe03-evil.westeurope.1.azurestaticapps.net',
          ACC_ORIGINS,
          SLUGS,
          false
        )
      ).toBe(false);
    });

    it('refuses a look-alike domain', () => {
      expect(
        isAllowedOrigin(
          'https://ashy-pebble-0d80dbe03-1.westeurope.1.azurestaticapps.net.evil.test',
          ACC_ORIGINS,
          SLUGS,
          false
        )
      ).toBe(false);
    });

    it('allows nothing when no slug is configured', () => {
      expect(
        isAllowedOrigin(
          'https://ashy-pebble-0d80dbe03-181.westeurope.1.azurestaticapps.net',
          ACC_ORIGINS,
          [],
          false
        )
      ).toBe(false);
    });
  });

  describe('production', () => {
    it('refuses every preview origin, whatever is configured', () => {
      // The decision recorded on #37: previews reach the shared ACC backend and
      // never production. Enforced here rather than by trusting the setting to
      // be empty, so a value that finds its way onto the production App Service
      // changes nothing.
      expect(
        isAllowedOrigin(
          'https://ashy-pebble-0d80dbe03-181.westeurope.1.azurestaticapps.net',
          ACC_ORIGINS,
          SLUGS,
          true
        )
      ).toBe(false);
    });

    it('still allows the configured origins', () => {
      expect(isAllowedOrigin('https://acc.mijn.open-regels.nl', ACC_ORIGINS, SLUGS, true)).toBe(
        true
      );
    });
  });
});

describe('corsOriginCallback', () => {
  function decide(origin: string | undefined, slugs: string[] = SLUGS, prod = false) {
    let allowed: boolean | undefined;
    let error: Error | null | undefined;
    corsOriginCallback(
      ACC_ORIGINS,
      slugs,
      prod
    )(origin, (err, allow) => {
      error = err;
      allowed = allow;
    });
    return { allowed, error };
  }

  it('allows a request with no Origin header', () => {
    // Server-to-server calls, curl and the App Service health probe send none.
    // Passing an array used to allow these implicitly; a function has to say so.
    // CORS governs browsers and is not an authentication boundary — refusing
    // origin-less requests would break every non-browser caller and stop no
    // attacker, since anything that is not a browser simply omits the header.
    expect(decide(undefined)).toEqual({ allowed: true, error: null });
  });

  it('allows an empty Origin the same way', () => {
    expect(decide('')).toEqual({ allowed: true, error: null });
  });

  it('passes an allowed origin through', () => {
    expect(decide('https://acc.mijn.open-regels.nl')).toEqual({ allowed: true, error: null });
  });

  it('reports a refusal without raising an error', () => {
    // `cors` turns `false` into a response without the allow-origin header,
    // which is the correct refusal. Calling back with an Error would surface as
    // a 500 and read like a server fault rather than a policy decision.
    expect(decide('https://example.test')).toEqual({ allowed: false, error: null });
  });

  it('applies the preview rule through the callback too', () => {
    expect(decide('https://red-river-0ce4c9803-42.westeurope.7.azurestaticapps.net')).toEqual({
      allowed: true,
      error: null,
    });
    expect(
      decide('https://red-river-0ce4c9803-42.westeurope.7.azurestaticapps.net', SLUGS, true)
    ).toEqual({ allowed: false, error: null });
  });
});
