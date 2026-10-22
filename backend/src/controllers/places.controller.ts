import type { Request, Response } from 'express';
import { RestaurantModel } from '../models';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/respond';

// ---------------------------------------------------------------------------
// Public places search (address picker)
//
// There is no external maps/geocoding provider configured, so this is a
// pragmatic local search over data the platform already owns:
//   * open/listed restaurants (name, cuisine, tags, area, street address) as
//     delivery destinations with their real coordinates
//   * a curated list of known Swat Valley areas/locals as a fallback
//
// No API keys or provider secrets are involved, and nothing is proxied from a
// third party, so the endpoint is safe to expose publicly.
// ---------------------------------------------------------------------------

export interface PlaceResult {
  id: string;
  label: string;
  full: string;
  area: string;
  lat: number;
  lng: number;
  /** Where the suggestion came from: a catalog restaurant or a known area. */
  source: 'restaurant' | 'area';
}

interface KnownArea {
  label: string;
  area: string;
  full: string;
  lat: number;
  lng: number;
}

/** Curated Swat Valley areas used when a query does not match a restaurant. */
const SWAT_AREAS: KnownArea[] = [
  {
    label: 'Mingora City',
    area: 'Mingora',
    full: 'Mingora City Centre, Swat',
    lat: 34.7802,
    lng: 72.3625,
  },
  {
    label: 'Saidu Sharif',
    area: 'Saidu Sharif',
    full: 'Saidu Sharif, Swat',
    lat: 34.7362,
    lng: 72.3567,
  },
  {
    label: 'Fizagat',
    area: 'Mingora',
    full: 'Fizagat, Swat River Banks',
    lat: 34.793,
    lng: 72.369,
  },
  { label: 'Kanju', area: 'Kanju', full: 'Kanju Township, Swat', lat: 34.7429, lng: 72.3118 },
  { label: 'Kabal', area: 'Kabal', full: 'Kabal Bazaar, Swat', lat: 34.7917, lng: 72.2797 },
  { label: 'Manglawar', area: 'Manglawar', full: 'Manglawar, Swat', lat: 34.7995, lng: 72.3883 },
  { label: 'Charbagh', area: 'Charbagh', full: 'Charbagh, Swat', lat: 34.8461, lng: 72.4444 },
  { label: 'Matta', area: 'Matta', full: 'Matta Bazaar, Swat', lat: 34.9183, lng: 72.3903 },
  {
    label: 'Khwazakhela',
    area: 'Khwazakhela',
    full: 'Khwazakhela, Swat',
    lat: 34.9753,
    lng: 72.4897,
  },
  {
    label: 'Bahrain',
    area: 'Bahrain',
    full: 'Bahrain Bazaar, Kalam Road',
    lat: 35.2077,
    lng: 72.5477,
  },
  {
    label: 'Malam Jabba',
    area: 'Malam Jabba',
    full: 'Malam Jabba Ski Resort, Swat',
    lat: 34.7971,
    lng: 72.5675,
  },
  { label: 'Kalam', area: 'Kalam', full: 'Kalam Valley, Swat', lat: 35.4897, lng: 72.5877 },
];

const RESTAURANT_LIMIT = 15;
const MAX_RESULTS = 20;

function restaurantPlace(restaurant: Record<string, any>): PlaceResult {
  const coordinates = Array.isArray(restaurant.location?.coordinates)
    ? restaurant.location.coordinates
    : [];
  const area = String(restaurant.area ?? '').trim();
  const street = String(restaurant.addressLine ?? '').trim();
  const full = [street, area].filter(Boolean).join(', ') || String(restaurant.name ?? '');

  return {
    id: `rest_${restaurant._id}`,
    label: String(restaurant.name ?? 'Restaurant'),
    full,
    area,
    lat: Number(coordinates[1] ?? 0),
    lng: Number(coordinates[0] ?? 0),
    source: 'restaurant',
  };
}

function areaPlace(area: KnownArea): PlaceResult {
  return {
    id: `area_${area.label.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
    label: area.label,
    full: area.full,
    area: area.area,
    lat: area.lat,
    lng: area.lng,
    source: 'area',
  };
}

export const searchPlaces = asyncHandler(async (req: Request, res: Response) => {
  // Bound the needle: unbounded input here feeds a $regex below, so cap the
  // length and escape regex metacharacters (prevents both pathological
  // patterns and filter-breaking characters).
  const q = String(req.query.q ?? '').trim().slice(0, 80);
  if (!q) {
    sendSuccess(res, { places: [] });
    return;
  }
  const safeQ = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const restaurants = await RestaurantModel.find({
    deletedAt: null,
    $or: [
      { name: { $regex: safeQ, $options: 'i' } },
      { cuisine: { $regex: safeQ, $options: 'i' } },
      { tags: { $regex: safeQ, $options: 'i' } },
      { area: { $regex: safeQ, $options: 'i' } },
      { addressLine: { $regex: safeQ, $options: 'i' } },
    ],
  })
    .limit(RESTAURANT_LIMIT)
    .lean();

  const needle = q.toLowerCase();
  const query = (a: KnownArea) =>
    a.label.toLowerCase().includes(needle) ||
    a.area.toLowerCase().includes(needle) ||
    a.full.toLowerCase().includes(needle);

  const places: PlaceResult[] = [
    ...restaurants.map((r) => restaurantPlace(r as Record<string, any>)),
    ...SWAT_AREAS.filter(query).map(areaPlace),
  ];

  sendSuccess(res, { places: places.slice(0, MAX_RESULTS) });
});
