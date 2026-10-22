import { OAuth2Client } from 'google-auth-library';
import { googleAuthConfigured, googleClientIds } from '../config/env';
import { FORBIDDEN, UNAUTHORIZED } from '../utils/AppError';

/** The subset of a Google profile this app is allowed to act on. */
export type GoogleIdentity = {
  /** Google's stable account id — used to detect a changed/relinked email. */
  googleId: string;
  email: string;
  name: string;
  picture: string | null;
};

const client = new OAuth2Client();

/**
 * Verify a Google ID token and return the identity it proves.
 *
 * Nothing from the client body is trusted here: the token is checked against
 * Google's public keys, its signature, its `aud` (must be one of our own OAuth
 * clients), its `iss`, and its expiry. A caller that sends a forged or
 * mismatched token gets an error and no account is created.
 */
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity> {
  if (!googleAuthConfigured) {
    throw FORBIDDEN('Google sign-in is not configured on this server');
  }

  let payload;
  try {
    const ticket = await client.verifyIdToken({
      idToken,
      // Required so the library rejects a token minted for a different app.
      audience: googleClientIds,
    });
    payload = ticket.getPayload();
  } catch (err) {
    // Never echo the underlying reason: it can contain token material.
    throw UNAUTHORIZED('Google sign-in could not be verified. Please try again.');
  }

  if (!payload?.sub || !payload.email) {
    throw UNAUTHORIZED('Google did not return an email address for this account');
  }

  // A token can be structurally valid while the email is unverified. Trusting an
  // unverified email would let someone reserve someone else's address.
  if (payload.email_verified === false) {
    throw FORBIDDEN('Your Google email address is not verified');
  }

  const [googleId] = payload.sub.split(':');

  return {
    googleId,
    email: payload.email.trim().toLowerCase(),
    name: (payload.name ?? '').trim() || payload.email.split('@')[0] || 'Customer',
    picture: typeof payload.picture === 'string' ? payload.picture : null,
  };
}
