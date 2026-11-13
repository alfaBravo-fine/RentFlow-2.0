import { describe, it, expect } from 'vitest';
import {
  isValidLatitude,
  isValidLongitude,
  sanitizeCoordinates,
  safeLngLatTuple,
} from '../../src/lib/geo';

describe('Geo & GIS Coordinate Safety Tests', () => {
  it('validates latitudes strictly between -90 and 90', () => {
    expect(isValidLatitude(0)).toBe(true);
    expect(isValidLatitude(37.7749)).toBe(true);
    expect(isValidLatitude(-89.999)).toBe(true);
    expect(isValidLatitude(90)).toBe(true);
    expect(isValidLatitude(-90)).toBe(true);

    expect(isValidLatitude(90.1)).toBe(false);
    expect(isValidLatitude(-90.1)).toBe(false);
    expect(isValidLatitude(120)).toBe(false);
    expect(isValidLatitude(NaN)).toBe(false);
  });

  it('validates longitudes strictly between -180 and 180', () => {
    expect(isValidLongitude(0)).toBe(true);
    expect(isValidLongitude(-122.4194)).toBe(true);
    expect(isValidLongitude(180)).toBe(true);
    expect(isValidLongitude(-180)).toBe(true);

    expect(isValidLongitude(180.1)).toBe(false);
    expect(isValidLongitude(-180.1)).toBe(false);
    expect(isValidLongitude(NaN)).toBe(false);
  });

  it('auto-recovers inverted latitude and longitude coordinates', () => {
    // User accidentally entered or saved lat=-122.399 (SF longitude) and lng=37.788 (SF latitude)
    const result = sanitizeCoordinates(-122.399, 37.788);
    expect(result).not.toBeNull();
    expect(result!.lat).toBe(37.788);
    expect(result!.lng).toBe(-122.399);

    const tuple = safeLngLatTuple(-122.399, 37.788);
    expect(tuple).toEqual([-122.399, 37.788]); // [lng, lat]
  });

  it('handles string coordinates properly', () => {
    const result = sanitizeCoordinates('39.7817', '-89.6501');
    expect(result).not.toBeNull();
    expect(result!.lat).toBe(39.7817);
    expect(result!.lng).toBe(-89.6501);

    const tuple = safeLngLatTuple('39.7817', '-89.6501');
    expect(tuple).toEqual([-89.6501, 39.7817]);
  });

  it('returns null on invalid / null / NaN inputs without crashing', () => {
    expect(sanitizeCoordinates(null, null)).toBeNull();
    expect(sanitizeCoordinates(undefined, 37)).toBeNull();
    expect(sanitizeCoordinates('invalid', 'coords')).toBeNull();
    expect(safeLngLatTuple(null, undefined)).toBeNull();
  });
});
