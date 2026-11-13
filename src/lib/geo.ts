/**
 * Geolocation & Coordinate Validation Utilities for RentFlow GIS
 * Guarantees strict MapLibre GL coordinate safety:
 * - Latitude must be in [-90, 90]
 * - Longitude must be in [-180, 180]
 * - MapLibre takes [lng, lat] tuples
 */

export interface ValidCoordinates {
  lat: number;
  lng: number;
}

export function isValidLatitude(lat: number): boolean {
  return typeof lat === 'number' && !isNaN(lat) && lat >= -90 && lat <= 90;
}

export function isValidLongitude(lng: number): boolean {
  return typeof lng === 'number' && !isNaN(lng) && lng >= -180 && lng <= 180;
}

/**
 * Parses and sanitizes raw coordinate inputs.
 * Automatically recovers from commonly swapped lat/lng inputs (e.g. lat = -122.4, lng = 37.7).
 * Clamps minor boundary overshoots to [-90, 90] and [-180, 180].
 */
export function sanitizeCoordinates(
  rawLat: unknown,
  rawLng: unknown
): ValidCoordinates | null {
  if (rawLat === null || rawLat === undefined || rawLng === null || rawLng === undefined) {
    return null;
  }
  if (rawLat === '' || rawLng === '') {
    return null;
  }

  let lat = typeof rawLat === 'string' ? parseFloat(rawLat) : Number(rawLat);
  let lng = typeof rawLng === 'string' ? parseFloat(rawLng) : Number(rawLng);

  if (isNaN(lat) || isNaN(lng) || !isFinite(lat) || !isFinite(lng)) {
    return null;
  }

  // Auto-detect swapped lat/lng:
  // Latitudes can never exceed 90 or be below -90. If lat is outside [-90, 90]
  // but lng is within [-90, 90], the coordinates were almost certainly swapped.
  if ((lat < -90 || lat > 90) && (lng >= -90 && lng <= 90)) {
    const temp = lat;
    lat = lng;
    lng = temp;
  }

  // Double check and clamp to valid geodetic ranges
  if (lat < -90) lat = -90;
  if (lat > 90) lat = 90;
  if (lng < -180) lng = -180;
  if (lng > 180) lng = 180;

  return { lat, lng };
}

/**
 * Formats coordinates for MapLibre GL API calls which expect [lng, lat] (longitude first).
 * Returns null if coordinates cannot be safely parsed.
 */
export function safeLngLatTuple(
  rawLat: unknown,
  rawLng: unknown
): [number, number] | null {
  const coords = sanitizeCoordinates(rawLat, rawLng);
  if (!coords) return null;
  return [coords.lng, coords.lat];
}

/**
 * Approximate geodetic center coordinates for major cities worldwide,
 * used for instantaneous offline resolution and resilient fallback.
 */
const CITY_FALLBACK_COORDINATES: Record<string, { lat: number; lng: number }> = {
  'san francisco': { lat: 37.7749, lng: -122.4194 },
  'new york': { lat: 40.7128, lng: -74.006 },
  'los angeles': { lat: 34.0522, lng: -118.2437 },
  'chicago': { lat: 41.8781, lng: -87.6298 },
  'houston': { lat: 29.7604, lng: -95.3698 },
  'phoenix': { lat: 33.4484, lng: -112.074 },
  'philadelphia': { lat: 39.9526, lng: -75.1652 },
  'san antonio': { lat: 29.4241, lng: -98.4936 },
  'san diego': { lat: 32.7157, lng: -117.1611 },
  'dallas': { lat: 32.7767, lng: -96.797 },
  'austin': { lat: 30.2672, lng: -97.7431 },
  'seattle': { lat: 47.6062, lng: -122.3321 },
  'springfield': { lat: 39.7817, lng: -89.6501 },
  'miami': { lat: 25.7617, lng: -80.1918 },
  'atlanta': { lat: 33.749, lng: -84.388 },
  'boston': { lat: 42.3601, lng: -71.0589 },
  'denver': { lat: 39.7392, lng: -104.9903 },
  'london': { lat: 51.5074, lng: -0.1278 },
  'manchester': { lat: 53.4808, lng: -2.2426 },
  'lahore': { lat: 31.5204, lng: 74.3587 },
  'karachi': { lat: 24.8607, lng: 67.0011 },
  'islamabad': { lat: 33.6844, lng: 73.0479 },
  'rawalpindi': { lat: 33.5651, lng: 73.0169 },
  'faisalabad': { lat: 31.4504, lng: 73.135 },
  'dubai': { lat: 25.2048, lng: 55.2708 },
  'abu dhabi': { lat: 24.4539, lng: 54.3773 },
  'toronto': { lat: 43.6532, lng: -79.3832 },
  'vancouver': { lat: 49.2827, lng: -123.1207 },
  'sydney': { lat: -33.8688, lng: 151.2093 },
  'melbourne': { lat: -37.8136, lng: 144.9631 },
  'berlin': { lat: 52.52, lng: 13.405 },
  'paris': { lat: 48.8566, lng: 2.3522 },
};

const COUNTRY_FALLBACK_COORDINATES: Record<string, { lat: number; lng: number }> = {
  US: { lat: 37.7749, lng: -122.4194 },
  PK: { lat: 31.5204, lng: 74.3587 },
  GB: { lat: 51.5074, lng: -0.1278 },
  CA: { lat: 43.6532, lng: -79.3832 },
  AU: { lat: -33.8688, lng: 151.2093 },
  AE: { lat: 25.2048, lng: 55.2708 },
  DE: { lat: 52.52, lng: 13.405 },
  FR: { lat: 48.8566, lng: 2.3522 },
  IN: { lat: 28.6139, lng: 77.209 },
};

/**
 * Deterministically generates a micro-offset (around ±0.005 to 0.015 degrees)
 * from a string seed so multiple properties in the same city are rendered with distinct pins.
 */
function getDeterministicJitter(seed: string): { latOffset: number; lngOffset: number } {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const normalizedA = ((Math.abs(hash) % 1000) / 1000) * 0.018 - 0.009;
  const normalizedB = (((Math.abs(hash) >> 3) % 1000) / 1000) * 0.018 - 0.009;
  return { latOffset: normalizedA, lngOffset: normalizedB };
}

/**
 * Geocodes an address string using OpenStreetMap Nominatim with automatic fallback
 * to city and country centroids if offline, throttled, or fictional address.
 */
export async function geocodeAddress(
  address: string,
  city?: string | null,
  countryCode?: string | null
): Promise<ValidCoordinates | null> {
  const cleanAddress = (address || '').trim();
  const cleanCity = (city || '').trim();
  if (!cleanAddress && !cleanCity) return null;

  // 1. Direct coordinate pattern detection e.g. "37.7749, -122.4194"
  const coordMatch = cleanAddress.match(/([-+]?\d{1,3}(?:\.\d+)?)\s*,\s*([-+]?\d{1,3}(?:\.\d+)?)/);
  if (coordMatch) {
    const parsed = sanitizeCoordinates(coordMatch[1], coordMatch[2]);
    if (parsed) return parsed;
  }

  // 2. Query OpenStreetMap Nominatim Free Geocoding API
  const queryParts = [cleanAddress, cleanCity, countryCode].filter(Boolean);
  const query = queryParts.join(', ');

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);

    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`,
      {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
        },
      }
    );
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0 && data[0].lat && data[0].lon) {
        const validated = sanitizeCoordinates(data[0].lat, data[0].lon);
        if (validated) return validated;
      }
    }
  } catch {
    // Network offline, rate-limited, or aborted - proceed to intelligent fallback
  }

  // 3. Fallback: Match known city in address or city argument
  const textToSearch = `${cleanCity} ${cleanAddress}`.toLowerCase();
  for (const [cityName, coords] of Object.entries(CITY_FALLBACK_COORDINATES)) {
    if (textToSearch.includes(cityName)) {
      const jitter = getDeterministicJitter(cleanAddress);
      return sanitizeCoordinates(coords.lat + jitter.latOffset, coords.lng + jitter.lngOffset);
    }
  }

  // 4. Fallback: Match country code centroid
  const normalizedCountry = (countryCode || 'US').toUpperCase();
  const countryBase =
    COUNTRY_FALLBACK_COORDINATES[normalizedCountry] || COUNTRY_FALLBACK_COORDINATES['US'];
  const jitter = getDeterministicJitter(cleanAddress);
  return sanitizeCoordinates(countryBase.lat + jitter.latOffset, countryBase.lng + jitter.lngOffset);
}
