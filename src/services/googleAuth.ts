import * as AuthSession from 'expo-auth-session';
import { exchangeCodeAsync } from 'expo-auth-session';
import { discovery } from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * OAuth client id, supplied through `expo.extra.googleClientId` in app.json.
 *
 * It must be a **Web** OAuth client id: the consent screen runs in an in-app
 * browser session, so Google mints the ID token for the web client. The same id
 * is configured on the backend so it can verify the `aud` claim.
 */
const GOOGLE_CLIENT_ID: string =
  (Constants.expoConfig?.extra as { googleClientId?: string } | undefined)?.googleClientId ?? '';

/**
 * Google sign-in is only offered when a client id is configured. Without this
 * the button would fail on every tap.
 */
export const googleAuthConfigured = GOOGLE_CLIENT_ID.length > 0;

export type GoogleSignInResult =
  | { status: 'success'; idToken: string }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

/**
 * Warms the browser session at module load. On Android the first
 * `openAuthSessionAsync` of a cold app can otherwise finish before the session
 * is ready and silently return `cancel`.
 */
WebBrowser.maybeCompleteAuthSession();

function redirectUri(): string {
  return AuthSession.makeRedirectUri({
    // Must match `scheme` in app.json.
    scheme: 'swatcity',
    // Android needs an explicit native redirect so control returns to the app
    // instead of opening the redirect URL in the browser.
    native: Platform.OS === 'android' ? 'swatcity://auth' : undefined,
  });
}

/** Maps Google/browser failure modes to text a user can act on. */
function describeError(error: unknown): string {
  const code = (error as { code?: string } | null)?.code ?? '';
  const raw = error instanceof Error ? error.message : String(error ?? '');

  if (code === 'ERR_CANCELED' || /cancel/i.test(raw)) return 'Google sign-in was cancelled.';
  if (/network|timeout|ENOTFOUND|ECONN|Failed to fetch/i.test(raw)) {
    return 'No internet connection. Check your network and try again.';
  }
  if (/invalid_request|invalid_grant|unauthorized_client/i.test(raw)) {
    return 'Google sign-in could not be verified. Please try again.';
  }
  return 'Google sign-in failed. Please try again.';
}

/**
 * Runs the Google account chooser and returns a verified ID token.
 *
 * Uses OAuth 2.0 authorization code flow with PKCE, so no client secret lives
 * in the app and the code cannot be replayed. `selectAccount` makes Google show
 * the account picker instead of silently reusing the last used account.
 */
export async function signInWithGoogle(): Promise<GoogleSignInResult> {
  if (!googleAuthConfigured) {
    return { status: 'error', message: 'Google sign-in is not set up on this app yet.' };
  }

  const uri = redirectUri();

  const request = new AuthSession.AuthRequest({
    clientId: GOOGLE_CLIENT_ID,
    scopes: ['openid', 'email', 'profile'],
    responseType: AuthSession.ResponseType.Code,
    redirectUri: uri,
    // `usePKCE` makes the request generate its own verifier/challenge and
    // state; the verifier below is then needed to redeem the code.
    usePKCE: true,
    extraParams: {
      // Always show the account chooser rather than reusing the last account.
      prompt: 'select_account',
      include_granted_scopes: 'true',
    },
  });

  try {
    const result = await request.promptAsync(discovery, {
      showInRecents: false,
    });

    if (result.type === 'cancel') {
      return { status: 'cancelled' };
    }
    if (result.type !== 'success') {
      return { status: 'error', message: describeError(result) };
    }

    // A missing code means the redirect carried something we cannot exchange.
    if (!result.params?.code) {
      return {
        status: 'error',
        message: 'Google sign-in could not be completed. Please try again.',
      };
    }

    // `usePKCE` guarantees a verifier; guard anyway rather than send an
    // un-exchangeable request.
    if (!request.codeVerifier) {
      return { status: 'error', message: 'Google sign-in could not be started. Please try again.' };
    }

    const tokens = await exchangeCodeAsync(
      {
        clientId: GOOGLE_CLIENT_ID,
        code: result.params.code,
        redirectUri: uri,
        // Bound to this request by PKCE.
        extraParams: { code_verifier: request.codeVerifier },
      },
      discovery,
    );

    const idToken = tokens.idToken;
    if (!idToken) {
      return {
        status: 'error',
        message: 'Google did not return a sign-in token. Please try again.',
      };
    }

    // Name, email and photo are deliberately not read here: the backend takes
    // them from the verified token, so the client never supplies identity data.
    return { status: 'success', idToken };
  } catch (error) {
    return { status: 'error', message: describeError(error) };
  }
}
