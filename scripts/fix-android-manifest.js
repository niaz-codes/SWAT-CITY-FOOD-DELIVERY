// ============================================================
// Swat City - repair the generated AndroidManifest.xml
//
// `expo prebuild` (SDK 58) writes the manifest wrapped in a stray `<root>`
// element, with a duplicate `<uses-permission>` outside `<manifest>`:
//
//     <root>
//       <manifest ...> ... </manifest>
//       <uses-permission .../>
//     </root>
//
// Only `<manifest>` may be the document element, and Android's manifest merger
// rejects the wrapper, so the Gradle build fails. This happened before and was
// fixed by hand (commit f74296d); a script means the fix survives every
// prebuild instead of being wiped by the next `--clean`.
//
// It also adds `android:usesCleartextTraffic` to `<application>`, which the
// template omits. Production traffic is HTTPS, but this keeps plain-HTTP
// calls (local/staging backends, embedded web content) working on API 28+
// rather than failing silently.
//
// Runs automatically after `expo prebuild` (see the `postprebuild` script) and
// again from EAS via `eas-build-post-install`, so both paths are covered.
// ============================================================

const fs = require('fs');
const path = require('path');

const MANIFEST = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'AndroidManifest.xml');

function repair(xml) {
  let next = xml;
  let changed = false;

  // 1. Unwrap the stray <root> element so <manifest> is the document element.
  if (/^\s*<root>/.test(next)) {
    next = next.replace(/^\s*<root>\s*/, '').replace(/<\/root>\s*$/, '');
    changed = true;
  }

  // 2. Drop anything trailing the closing </manifest> (the duplicated
  //    permission the template appends outside it).
  const closing = next.lastIndexOf('</manifest>');
  if (closing !== -1) {
    const end = closing + '</manifest>'.length;
    if (next.slice(end).trim()) {
      next = next.slice(0, end) + '\n';
      changed = true;
    }
  }

  // 3. Restore cleartext traffic on <application>.
  if (!next.includes('android:usesCleartextTraffic')) {
    next = next.replace(/<application\b/, '<application android:usesCleartextTraffic="true"');
    changed = true;
  }

  return { xml: next, changed };
}

function main() {
  if (!fs.existsSync(MANIFEST)) {
    console.log('[manifest:fix] no android/ project - skipping');
    return;
  }

  const original = fs.readFileSync(MANIFEST, 'utf8');
  const { xml, changed } = repair(original);

  if (!changed) {
    console.log('[manifest:fix] manifest already valid');
    return;
  }

  fs.writeFileSync(MANIFEST, xml);
  console.log('[manifest:fix] repaired android/app/src/main/AndroidManifest.xml');
}

main();
