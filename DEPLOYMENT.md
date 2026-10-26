# Deployment

- Environments: development, staging, production (separate databases and keys).
- Use environment variables for all config.
- Backend: run migrations, health-check endpoint, HTTPS, logs, daily backups.
- Mobile: increment version, build signed release, keep keystore OFF the repo.
- Rollback plan documented before each release.

## Backend on Railway

The API runs on Railway as the `backend` service in the `swat-city-backend`
project. Only the `backend/` folder is uploaded; Railway builds it with Railpack
(`npm ci` → `tsc` → `npm start`) and injects `PORT` itself.

- **Public URL:** `https://backend-production-73f5.up.railway.app`
- **Health probe:** `GET /health` (outside `/api`, so it works against the bare origin)
- **Node version:** `>=22` is required (`@supabase/supabase-js` needs a native
  WebSocket; Node 18/20 crash on boot). Pinned in `backend/package.json`
  (`engines`), which Railpack resolves during build.
- **Runtime env:** every key from `backend/.env` except `PORT` and `NODE_ENV`;
  `NODE_ENV=production` and `PUBLIC_API_URL=https://backend-production-73f5.up.railway.app`
  are set on Railway. Never commit real values.

Deploy:

```bash
cd backend
railway link            # once per machine (select the swat-city-backend project)
railway up -y --service backend              # uploads the working tree and deploys
railway logs --lines 50 # boot logs: [db] Supabase connected, [integrations] ...
```

Scoped upload tip: by default `railway up` archives the whole Git project. If a
deploy builds the wrong app, scope it explicitly, run from the repo root:
`railway up ./backend --path-as-root --service backend`.

## Admin panel on Railway

The admin console (admin-web) deploys to the same Railway project as an
`admin-web` service. Railpack auto-detects it as a **vite static site**:

- builds with `npm install` → `npm run build` (`tsc -b && vite build`)
- serves `dist/` with **Caddy** on the injected `PORT` (8080), SPA routing included
- build-time env: the service variable `VITE_API_BASE_URL` (Railway API `/api`)
- **Public URL:** `https://admin-web-production-e2fa.up.railway.app`

The `VITE_API_BASE_URL` variable is inlined at build time — after changing it,
redeploy (`railway redeploy -y --service admin-web`) so a fresh bundle ships.

Deploy:

```bash
railway up ./admin-web --path-as-root -y --service admin-web
```

The `--path-as-root` flag is required: without it the CLI archives the whole
repo and Railpack patterns on the mobile root `package.json` (`expo start`).

The backend `CORS_ORIGIN` must include this origin
(`https://admin-web-production-e2fa.up.railway.app`). The panel also stays
deployable on Vercel (`admin-web/railway.json` is legacy Nixpacks config kept
for reference; Railpack's auto-detection is what actually builds `admin-web`).

Changing a variable requires a restart to take effect:

```bash
railway variable set KEY=value && railway redeploy -y
```

### Recreating the `backend` service

The project sometimes loses its service (it happened 23–26 Oct 2026); the
service, its variables and its public domain are what disappear, the project
itself survives. To bring it back:

```bash
cd backend
railway link --project 5fd9f221-eee3-4421-998a-a6438505c372 --environment production --json
railway add --service backend --json     # creates an empty service
railway up -y --service backend          # uploads the working tree and deploys
```

Then restore the variables so the API boots healthy:

```bash
pwsh -File ../scripts/railway-backend-vars.ps1   # copies every key from backend/.env
railway variable set CORS_ORIGIN=https://admin-web-seven-vert.vercel.app,http://localhost:5173 --skip-deploys
railway redeploy -y
```

The public URL also dies with the service. Regenerate it and rename it back to
the production host so no app change is needed:

```bash
railway domain --service backend --json                       # generates e.g. backend-production-8af2...
railway domain list --service backend --json                  # note the domain id
railway domain update <DOMAIN_ID> --domain backend-production-73f5 --port 8080 --service backend --json
```

`CORS_ORIGIN` is the admin web origin. Add other browser origins as a
comma-separated list if needed; native mobile requests do not send an Origin
header. Railway supplies `PORT` automatically — do not set a fixed port.
Variables that must exist for boot: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`,
`ADMIN_EMAIL`, `ADMIN_PASSWORD`, `JWT_SECRET`, `JWT_REFRESH_SECRET`;
`NODE_ENV=production` and
`PUBLIC_API_URL=https://backend-production-73f5.up.railway.app`.
Add optional integration variables only when enabling that integration — the
names come from `backend/.env.example`, and blank/omitted provider credentials
leave those integrations unconfigured. Payment credentials are enabled only for
the matching merchant's test environment first. OTP mail delivery is configured
in the Supabase Auth dashboard (below), not by the backend SMTP variables.

Verify after a deploy: `/health` returns 200 with
`{"status":"ok","database":"connected",...}` and `/integration-status` lists
only configuration states, never credentials.

## OTP email delivery (Supabase Auth)

OTP codes are generated, emailed and verified by Supabase Auth, so delivery is
configured in the Supabase dashboard, not on Railway. No email credentials are
needed in `backend/.env` for OTPs — the `SMTP_*` variables only carry the
optional "password changed" notice.

### 1. SMTP (delivery)

*Authentication → Emails → SMTP Settings*: enable custom SMTP.

- Host `smtp.gmail.com`, port `587`, SSL **off** (port `465` uses SSL **on**)
- Username: the full Gmail address; password: a 16-character Google App Password
- Sender: the same Gmail address

The built-in Supabase mailer is rate limited and does not reach Gmail reliably.

### 2. Templates must show the code

*Authentication → Emails → Templates*. The app asks the user to type a 6-digit
code, so the email body must contain `{{ .Token }}`:

- **Confirm signup** — sent the first time an address is used
- **Magic Link** — sent for sign-in and password reset on an existing address

Do **not** keep `{{ .ConfirmationURL }}` in those templates. Every code is
single-use: if the user (or a mail scanner) opens the link, the token is
consumed and the typed code fails with `otp_expired`. A code-only email avoids
that entirely.

### 3. URLs (no more `localhost:3000`)

*Authentication → URL Configuration*:

- **Site URL:** `https://backend-production-73f5.up.railway.app` (used only if
  an old template still renders a link — never leave the localhost default)
- **Redirect URLs:** `https://backend-production-73f5.up.railway.app/**`,
  `swatcity://**`, `http://localhost:8081/**` (Expo web dev)

`http://localhost:3000/#error=access_denied&error_code=otp_expired` is the
Supabase default Site URL: an email link had no allowed target, so Supabase
redirected there. The OTP itself was unaffected.

### 4. Expiry

*Authentication → Providers → Email → Email OTP Expiration*: `600` seconds. The
backend also enforces its own 5-minute window, so the mailbox code and the local
record expire close together.

### Apply automatically (optional)

`backend/src/scripts/supabase-auth-config.ts` writes the templates, Site URL,
redirect list, 6-digit length and 600-second expiry in one call:

```bash
cd backend
# 1. create a personal access token: https://supabase.com/dashboard/account/tokens
# 2. add SUPABASE_ACCESS_TOKEN=sbp_... to backend/.env (never commit it)
npm run auth:config
# 3. delete the token from .env afterwards
```

Set `AUTH_EMAIL_REDIRECT_URL` only if a template should keep a link (for
example `swatcity://auth`); the value must also be listed in Redirect URLs.

## Android APK (internal sharing)

`EXPO_PUBLIC_API_URL` is inlined into the JS bundle at build time, so it must
point at the deployed API before building:

- EAS preview profile: `eas.json` → `build.base.env.EXPO_PUBLIC_API_URL`
  (already set to the Railway `/api` URL). Run `npx eas build -p android --profile preview`.
- Local release build: `android/gradlew.bat assembleRelease` with
  `EXPO_PUBLIC_API_URL` set in the environment. The APK lands in
  `android/app/build/outputs/apk/release/app-release.apk`.

If `android/keystore.properties` is absent, release builds fall back to the
debug signing config — fine for internal sharing, not for Play Store uploads.

### Regenerating the Android project

`android/` is committed, and EAS skips prebuild when it exists ("EAS Build will
use the value found in the native code"). So after an Expo SDK upgrade you must
regenerate it and commit the result, or the repo will not describe the build
that actually ships:

```powershell
npm run prebuild   # expo prebuild && npm run manifest:fix
```

`prebuild --clean` deletes everything under `android/`, including files that are
not regenerated. Config plugins in `plugins/` re-create them:

| Removed by `--clean` | Restored by |
| --- | --- |
| `keystore.properties` + `release.keystore` | `plugins/withAndroidReleaseSigning.js`, from `credentials.json` and the gitignored `release.keystore` at the repo root |
| notification icons, `@color/notification_color` | `plugins/withPushNotifications.js` |

Two more plugins correct things prebuild gets wrong rather than restoring
deleted files:

- `plugins/withGoogleServices.js` strips the stale
  `apply plugin: 'com.google.gms.google-services'` line. It is legacy from an
  earlier plan to deliver push through FCM, but nothing in the app uses the
  Firebase SDK — push goes through `expo-notifications` (the Expo Push Service)
  — and prebuild regenerates the root `build.gradle` without the matching
  `com.google.gms:google-services` classpath. Left in, it fails every build with
  `Plugin with id 'com.google.gms.google-services' not found`.
- `scripts/fix-android-manifest.js` repairs `AndroidManifest.xml`, which Expo
  SDK 58 emits wrapped in a stray `<root>` element with the permissions
  duplicated outside `<manifest>`. Android's manifest merger rejects that. It
  also restores `android:usesCleartextTraffic`. It runs from `npm run prebuild`
  and on EAS from the `eas-build-post-install` hook (which runs after prebuild).

> Plugin ordering matters: `withGoogleServices` is listed **last** in
> `app.json` because `expo-notifications` also rewrites `app/build.gradle` and
> would otherwise re-add the line after this plugin removed it.

`release.keystore` lives at the repo root rather than in `android/` on purpose:
a file under `android/` cannot be used to restore itself after `--clean`
deletes it.

### Keep build output out of the EAS archive (`.easignore`)

EAS archives the project and uploads it. Nested `.gitignore` files such as
`android/.gitignore` are **not** reliably applied to that archive, so a root
`.easignore` lists the machine-specific directories explicitly:

```
android/build/  android/.gradle/  android/app/build/  android/app/.cxx/
```

This matters because `android/build/generated/autolinking/autolinking.json`
caches **absolute** paths from whichever machine last ran Gradle. A
Windows-generated copy that reaches the Linux builder makes Gradle configure
`:react-native-worklets` at

```
/home/expo/workingdir/build/android/C:/Users/.../node_modules/react-native-worklets/android
```

and the build dies with `Configuring project ':react-native-worklets' without an
existing directory is not allowed.` Delete `android/build/`, `android/.gradle/`
and `android/app/build/` before handing the project to EAS if it was ever built
on another OS.

