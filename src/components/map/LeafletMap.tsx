import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { useThemeColors } from '../../theme/ThemeContext';

export type MapMarkerKind = 'rider' | 'customer' | 'restaurant' | 'destination';

export type MapMarker = {
  id: string;
  lat: number;
  lng: number;
  kind?: MapMarkerKind;
  label?: string;
  avatarUrl?: string | null;
  /** Compass heading in degrees; rotates bike/vehicle markers. */
  heading?: number;
  selected?: boolean;
  popupLines?: { label: string; value: string }[];
};

export type MapRoutePoint = { lat: number; lng: number };

export type LeafletMapHandle = {
  flyTo: (lat: number, lng: number, zoom?: number) => void;
  fitToMarkers: () => void;
  reload: () => void;
};

type Props = {
  markers?: MapMarker[];
  route?: MapRoutePoint[];
  /** Used before markers arrive, so the map is not centred on null island. */
  initialCenter?: { lat: number; lng: number };
  initialZoom?: number;
  height?: number;
  /** Corner radius of the map frame; defaults to the standard card radius. */
  borderRadius?: number;
  interactive?: boolean;
  /** Auto-recentre whenever markers change (rider app / live tracking). */
  followMarkers?: boolean;
  onMarkerPress?: (id: string) => void;
  /**
   * Enables tap-to-pick: tapping the map reports the coordinates. Used by the
   * rider registration map, where the rider chooses their own base. Omit it and
   * the map behaves exactly as before (pan/zoom only), so existing callers are
   * unaffected.
   */
  onPick?: (lat: number, lng: number) => void;
  onMapError?: (message: string) => void;
  loading?: boolean;
};

const LEAFLET_VERSION = '1.9.4';
const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; OpenStreetMap';

type MapWireState = {
  markers: MapMarker[];
  route: MapRoutePoint[];
  selectedId?: string | null;
  dark: boolean;
};

type BuildHtmlOptions = MapWireState & {
  initialCenter?: { lat: number; lng: number };
  initialZoom: number;
  pickable: boolean;
};

/** Escapes a JSON payload so it can never terminate the host <script> block. */
function safeInlineJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * Leaflet is loaded from a CDN and driven imperatively: RN injects state via
 * `__swatUpdate`, so moving a marker never re-renders the WebView document.
 * This is what keeps a 15-rider admin map smooth on a mid-range Android phone.
 */
function buildHtml(initial: BuildHtmlOptions): string {
  const markerData = safeInlineJson(initial.markers);
  const routeData = safeInlineJson(initial.route);
  const selectedId = safeInlineJson(initial.selectedId ?? null);
  const darkMode = initial.dark ? 'true' : 'false';
  const pickable = initial.pickable ? 'true' : 'false';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js"></script>
<style>
  html, body, #map { height: 100%; margin: 0; padding: 0; background: #E8EDE9; }
  body { -webkit-tap-highlight-color: transparent; }
  .leaflet-container { font-family: -apple-system, Roboto, "Segoe UI", sans-serif; }
  .swat-pin { background: none; border: none; }
  .swat-body {
    width: 34px; height: 34px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    color: #fff; font-size: 15px; font-weight: 700;
    border: 3px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,.35);
  }
  .swat-body.selected { transform: scale(1.22); }
  .swat-body img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }
  .swat-cursor { transform-origin: center; }
  .leaflet-popup-content-wrapper { border-radius: 10px; }
  .swat-popup-title { font-weight: 700; font-size: 13px; margin-bottom: 4px; }
  .swat-popup-row { font-size: 12px; color: #444; }
  .swat-spinner {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  }
</style>
</head>
<body>
<div id="map"></div>
<script>
(function () {
  var COLORS = { rider: '#0E3F3A', customer: '#2563EB', restaurant: '#F59E0B', destination: '#DC2626' };
  var GLYPH = { rider: '\u25B6', customer: '\u25CF', restaurant: '\u25A0', destination: '\u25C6' };

  function post(payload) {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify(payload));
    }
  }

  if (typeof L === 'undefined') {
    post({ type: 'error', message: 'Map engine failed to load. Check your internet connection.' });
    return;
  }

  var start = ${markerData}[0] || ${routeData}[0];
  var center = start ? [start.lat, start.lng] : [34.9118, 72.3211]; // Swat (Mingora) default
  var map = L.map('map', { zoomControl: false, attributionControl: true }).setView(center, ${initial.initialZoom});
  L.control.zoom({ position: 'topright' }).addTo(map);
  L.tileLayer('${TILE_URL}', { maxZoom: 19, attribution: '${ATTRIBUTION}' }).addTo(map);

  var routeLine = L.polyline([], { color: '#0E3F3A', weight: 4, opacity: 0.75, dashArray: '8 8' }).addTo(map);
  var layerById = {};
  var selectedId = ${selectedId};
  var darkMode = ${darkMode};

  // Tap-to-pick is opt-in per screen: only the rider registration map enables
  // it, so the tracking and admin maps keep their current tap behaviour.
  if (${pickable}) {
    map.on('click', function (e) {
      post({ type: 'pick', lat: e.latlng.lat, lng: e.latlng.lng });
    });
  }

  function applyDark() {
    // OSM publishes light tiles only; inverting the tile pane yields a
    // readable dark map without shipping a second tile server.
    var panes = document.querySelectorAll('.leaflet-tile-pane');
    for (var i = 0; i < panes.length; i++) {
      panes[i].style.filter = darkMode
        ? 'invert(1) hue-rotate(180deg) brightness(0.92) contrast(0.86)'
        : 'none';
    }
  }

  function markerHtml(marker, isSelected) {
    var color = COLORS[marker.kind || 'rider'];
    var inner = marker.avatarUrl
      ? '<img src="' + String(marker.avatarUrl).replace(/"/g, '') + '" alt="" />'
      : escapeHtml(GLYPH[marker.kind || 'rider']);
    var body = '<div class="swat-body' + (isSelected ? ' selected' : '') + '" style="background:' + color + '">' + inner + '</div>';
    if (typeof marker.heading === 'number' && marker.kind === 'rider') {
      return '<div class="swat-cursor" style="transform: rotate(' + (marker.heading || 0) + 'deg)">' + body + '</div>';
    }
    return body;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function popupHtml(marker) {
    var rows = '';
    if (marker.label) rows += '<div class="swat-popup-title">' + escapeHtml(marker.label) + '</div>';
    if (marker.popupLines && marker.popupLines.length) {
      for (var i = 0; i < marker.popupLines.length; i++) {
        rows += '<div class="swat-popup-row"><b>' + escapeHtml(marker.popupLines[i].label) + ':</b> ' +
          escapeHtml(marker.popupLines[i].value) + '</div>';
      }
    }
    return rows || '<div class="swat-popup-row">Rider</div>';
  }

  function syncMarkers(markers, selected) {
    selectedId = selected || null;
    var seen = {};
    for (var i = 0; i < markers.length; i++) {
      var marker = markers[i];
      if (typeof marker.lat !== 'number' || typeof marker.lng !== 'number') continue;
      seen[marker.id] = true;
      var isSelected = marker.id === selectedId || marker.selected === true;
      var icon = L.divIcon({
        className: 'swat-pin',
        html: markerHtml(marker, isSelected),
        iconSize: [34, 34],
        iconAnchor: [17, 17],
        popupAnchor: [0, -18],
      });
      var existing = layerById[marker.id];
      if (existing) {
        existing.setLatLng([marker.lat, marker.lng]);
        existing.setIcon(icon);
        if (existing.isPopupOpen()) existing.setPopupContent(popupHtml(marker));
      } else {
        var created = L.marker([marker.lat, marker.lng], { icon: icon, riseOnHover: true }).addTo(map);
        created.bindPopup(popupHtml(marker));
        created.on('click', function () { post({ type: 'markerPress', id: marker.id }); });
        layerById[marker.id] = created;
      }
    }
    for (var existingId in layerById) {
      if (!seen[existingId]) {
        map.removeLayer(layerById[existingId]);
        delete layerById[existingId];
      }
    }
  }

  function syncRoute(points) {
    routeLine.setLatLngs(points.map(function (p) { return [p.lat, p.lng]; }));
  }

  window.__swatUpdate = function (state) {
    if (typeof state.dark === 'boolean' && state.dark !== darkMode) {
      darkMode = state.dark;
      applyDark();
    }
    if (state.route) syncRoute(state.route);
    if (state.markers) syncMarkers(state.markers, state.selectedId);
  };

  window.__swatFlyTo = function (lat, lng, zoom) {
    map.setView([lat, lng], zoom || Math.max(map.getZoom(), 15), { animate: true });
  };

  window.__swatFit = function () {
    var points = [];
    for (var id in layerById) points.push(layerById[id].getLatLng());
    points = points.concat(routeLine.getLatLngs());
    if (!points.length) return;
    if (points.length === 1) { map.setView(points[0], 15); return; }
    map.fitBounds(L.latLngBounds(points).pad(0.25));
  };

  applyDark();
  syncMarkers(${markerData}, ${selectedId});
  syncRoute(${routeData});
  post({ type: 'ready' });
})();
</script>
</body>
</html>`;
}

function LeafletMapInner(props: Props, ref: React.Ref<LeafletMapHandle>) {
  const { colors, dark } = useThemeColors();
  // Typed as the class instance (not the `WebViewComponent` value) so the
  // generic prop resolution on <WebView> cannot collapse to `never`.
  const webRef = useRef<InstanceType<typeof WebView>>(null);
  const readyRef = useRef(false);

  const {
    markers = [],
    route = [],
    initialCenter,
    initialZoom = 14,
    height = 260,
    borderRadius = 14,
    interactive = true,
    followMarkers = false,
    onMarkerPress,
    onPick,
    onMapError,
    loading = false,
  } = props;

  const pickable = Boolean(onPick);

  const html = useMemo(
    () =>
      buildHtml({
        markers,
        route,
        selectedId: markers.find((m) => m.selected)?.id ?? null,
        dark,
        initialCenter,
        initialZoom,
        pickable,
      }),
    // The document is built once per theme flip / pick-mode flip only. Marker
    // movement is pushed through injectJavaScript below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dark, pickable],
  );

  // Push marker/route changes into the already-loaded document.
  useEffect(() => {
    if (!readyRef.current) return;
    const payload = safeInlineJson({
      markers,
      route,
      selectedId: markers.find((m) => m.selected)?.id ?? null,
    });
    webRef.current?.injectJavaScript(
      `window.__swatUpdate && window.__swatUpdate(${payload}); true;`,
    );
  }, [markers, route]);

  useEffect(() => {
    if (!followMarkers || !readyRef.current || markers.length === 0) return;
    webRef.current?.injectJavaScript('window.__swatFit && window.__swatFit(); true;');
  }, [markers, followMarkers]);

  useImperativeHandle(
    ref,
    () => ({
      flyTo: (lat, lng, zoom) =>
        webRef.current?.injectJavaScript(
          `window.__swatFlyTo && window.__swatFlyTo(${Number(lat)}, ${Number(lng)}, ${Number(zoom ?? 15)}); true;`,
        ),
      fitToMarkers: () =>
        webRef.current?.injectJavaScript('window.__swatFit && window.__swatFit(); true;'),
      reload: () => {
        readyRef.current = false;
        webRef.current?.reload();
      },
    }),
    [],
  );

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let parsed: { type?: string; id?: string; message?: string; lat?: number; lng?: number };
      try {
        parsed = JSON.parse(event.nativeEvent.data);
      } catch {
        return;
      }
      if (parsed.type === 'ready') {
        readyRef.current = true;
        return;
      }
      if (parsed.type === 'error') {
        onMapError?.(parsed.message ?? 'Map failed to load');
        return;
      }
      if (
        parsed.type === 'pick' &&
        typeof parsed.lat === 'number' &&
        typeof parsed.lng === 'number'
      ) {
        onPick?.(parsed.lat, parsed.lng);
        return;
      }
      if (parsed.type === 'markerPress' && parsed.id) onMarkerPress?.(parsed.id);
    },
    [onMarkerPress, onMapError, onPick],
  );

  return (
    <View
      style={[
        styles.container,
        { height, borderColor: colors.border, backgroundColor: colors.surfaceAlt, borderRadius },
      ]}
    >
      <WebView
        ref={webRef}
        source={{ html }}
        onMessage={handleMessage}
        onLoadEnd={() => {
          readyRef.current = true;
        }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        nestedScrollEnabled
        scrollEnabled={interactive}
        bounces={false}
        overScrollMode="never"
        // Leaflet renders its own zoom control and the viewport meta disables
        // user scaling, so the native WebView zoom must stay off - otherwise
        // a second control set appears and fights the map.
        setBuiltInZoomControls={false}
        setDisplayZoomControls={false}
        style={{ backgroundColor: colors.surfaceAlt }}
      />
      {loading ? (
        <View style={styles.loading} pointerEvents="none">
          <ActivityIndicator color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading map…</Text>
        </View>
      ) : null}
    </View>
  );
}

export const LeafletMap = forwardRef<LeafletMapHandle, Props>(LeafletMapInner);

const styles = StyleSheet.create({
  container: {
    width: '100%',
    overflow: 'hidden',
    borderWidth: 1,
    borderRadius: 14,
  },
  loading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: { fontSize: 12 },
});
