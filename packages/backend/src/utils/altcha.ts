// CJS-compatible wrapper for altcha-lib v1.
// The package ships ESM-only types for the /v1 subpath; require() loads the
// CJS build at runtime and we provide the types inline.

/* eslint-disable @typescript-eslint/no-require-imports */

interface AltchaChallenge {
  algorithm: string;
  challenge: string;
  maxnumber?: number;
  salt: string;
  signature: string;
}

interface AltchaCreateOptions {
  hmacKey: string;
  algorithm?: 'SHA-1' | 'SHA-256' | 'SHA-512';
  expires?: Date;
  maxNumber?: number;
  params?: Record<string, string>;
  salt?: string;
  saltLength?: number;
}

const lib = require('altcha-lib/v1') as {
  createChallenge(options: AltchaCreateOptions): Promise<AltchaChallenge>;
  verifySolution(
    payload: string | object,
    hmacKey: string,
    checkExpires?: boolean
  ): Promise<boolean>;
};

export const createChallenge = lib.createChallenge.bind(lib);
export const verifySolution = lib.verifySolution.bind(lib);
