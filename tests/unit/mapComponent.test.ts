import { describe, it, expect, vi } from 'vitest';
import {
  getMapTilerApiKey,
  resolveInitialProviderTier,
  getMapStyle,
  normalizeMapLayer,
  apply3DBuildingsLayer,
  applyTerrainLayer,
  clear3DEnhancements,
  BUILDING_3D_LAYER_ID,
  TERRAIN_DEM_SOURCE_ID,
  TERRAIN_HILLSHADE_LAYER_ID,
} from '../../src/features/map/MapComponent';

describe('MapComponent Provider Fallback & 3D Extrusion Logic', () => {
  it('detects missing/placeholder MapTiler keys and defaults to openfreemap tier', () => {
    expect(getMapTilerApiKey('')).toBe('');
    expect(getMapTilerApiKey('  YOUR_KEY_HERE  ')).toBe('');
    expect(getMapTilerApiKey('your_maptiler_api_key_here')).toBe('');
    expect(getMapTilerApiKey('valid_key_123')).toBe('valid_key_123');

    expect(resolveInitialProviderTier('')).toBe('openfreemap');
    expect(resolveInitialProviderTier('valid_key_123')).toBe('maptiler');
  });

  it('normalizes map layers safely across all 5 supported modes', () => {
    expect(normalizeMapLayer('streets')).toBe('streets');
    expect(normalizeMapLayer('satellite')).toBe('satellite');
    expect(normalizeMapLayer('terrain')).toBe('terrain');
    expect(normalizeMapLayer('buildings3d')).toBe('buildings3d');
    expect(normalizeMapLayer('dark')).toBe('dark');
    expect(normalizeMapLayer('unknown_mode')).toBe('streets');
  });

  it('resolves MapTiler, OpenFreeMap, and OSM raster fallback styles properly for all 5 modes', () => {
    // Tier 1: MapTiler
    expect(getMapStyle('streets', 'maptiler', 'abc123')).toBe(
      'https://api.maptiler.com/maps/streets-v2/style.json?key=abc123'
    );
    expect(getMapStyle('satellite', 'maptiler', 'abc123')).toBe(
      'https://api.maptiler.com/maps/hybrid/style.json?key=abc123'
    );
    expect(getMapStyle('terrain', 'maptiler', 'abc123')).toBe(
      'https://api.maptiler.com/maps/outdoor-v2/style.json?key=abc123'
    );
    expect(getMapStyle('buildings3d', 'maptiler', 'abc123')).toBe(
      'https://api.maptiler.com/maps/streets-v2/style.json?key=abc123'
    );
    expect(getMapStyle('dark', 'maptiler', 'abc123')).toBe(
      'https://api.maptiler.com/maps/dataviz-dark/style.json?key=abc123'
    );

    // Tier 2: OpenFreeMap (no API key)
    expect(getMapStyle('streets', 'openfreemap', '')).toBe(
      'https://tiles.openfreemap.org/styles/liberty'
    );
    expect(getMapStyle('buildings3d', 'openfreemap', '')).toBe(
      'https://tiles.openfreemap.org/styles/liberty'
    );
    expect(getMapStyle('terrain', 'openfreemap', '')).toBe(
      'https://tiles.openfreemap.org/styles/liberty'
    );
    expect(getMapStyle('dark', 'openfreemap', '')).toBe(
      'https://tiles.openfreemap.org/styles/dark'
    );
    const satFallback = getMapStyle('satellite', 'openfreemap', '') as any;
    expect(satFallback.version).toBe(8);
    expect(satFallback.sources['esri-world-imagery']).toBeDefined();
    expect(satFallback.sources['satellite-city-labels']).toBeDefined();

    // Tier 3: Standard OpenStreetMap raster fallback
    const osmFallback = getMapStyle('streets', 'osm', '') as any;
    expect(osmFallback.version).toBe(8);
    expect(osmFallback.sources['osm-tiles'].tiles[0]).toBe(
      'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
    );
  });

  it('adds fill-extrusion 3D buildings layer below labels when vector source exists', () => {
    const addedLayers: any[] = [];
    const beforeIds: Array<string | undefined> = [];
    const mockMap: any = {
      getStyle: () => ({
        version: 8,
        sources: {
          openmaptiles: { type: 'vector' },
        },
        layers: [
          { id: 'background', type: 'background' },
          { id: 'building', type: 'fill', source: 'openmaptiles', 'source-layer': 'building' },
          { id: 'place_city', type: 'symbol', layout: { 'text-field': '{name}' } },
        ],
      }),
      getLayer: (id: string) => addedLayers.find((l) => l.id === id),
      removeLayer: vi.fn(),
      setLayoutProperty: vi.fn(),
      addLayer: vi.fn((layer: any, beforeId?: string) => {
        addedLayers.push(layer);
        beforeIds.push(beforeId);
      }),
      setLight: vi.fn(),
    };

    const applied = apply3DBuildingsLayer(mockMap);
    expect(applied).toBe(true);
    expect(mockMap.addLayer).toHaveBeenCalledTimes(1);
    expect(addedLayers[0].id).toBe(BUILDING_3D_LAYER_ID);
    expect(addedLayers[0].type).toBe('fill-extrusion');
    expect(addedLayers[0].source).toBe('openmaptiles');
    expect(addedLayers[0]['source-layer']).toBe('building');
    expect(beforeIds[0]).toBe('place_city');
    expect(mockMap.setLight).toHaveBeenCalled();
  });

  it('returns false safely for apply3DBuildingsLayer on raster-only styles and configures/clears terrain cleanly', () => {
    const rasterOnlyMap: any = {
      getStyle: () => ({
        version: 8,
        sources: { 'osm-tiles': { type: 'raster' } },
        layers: [{ id: 'osm-tiles-layer', type: 'raster', source: 'osm-tiles' }],
      }),
    };
    expect(apply3DBuildingsLayer(rasterOnlyMap)).toBe(false);

    const sources = new Map<string, any>();
    const layers = new Map<string, any>();
    const terrainMap: any = {
      getStyle: () => ({
        version: 8,
        sources: { openmaptiles: { type: 'vector' } },
        layers: [{ id: 'place_label', type: 'symbol', layout: { 'text-field': '{name}' } }],
      }),
      getSource: (id: string) => sources.get(id),
      addSource: vi.fn((id: string, cfg: any) => sources.set(id, cfg)),
      getLayer: (id: string) => layers.get(id),
      addLayer: vi.fn((layer: any) => layers.set(layer.id, layer)),
      removeLayer: vi.fn((id: string) => layers.delete(id)),
      setTerrain: vi.fn(),
    };

    expect(applyTerrainLayer(terrainMap, 'openfreemap', '')).toBe(true);
    expect(sources.get(TERRAIN_DEM_SOURCE_ID).encoding).toBe('terrarium');
    expect(layers.get(TERRAIN_HILLSHADE_LAYER_ID)).toBeDefined();
    expect(terrainMap.setTerrain).toHaveBeenCalledWith({
      source: TERRAIN_DEM_SOURCE_ID,
      exaggeration: 1.5,
    });

    clear3DEnhancements(terrainMap);
    expect(terrainMap.setTerrain).toHaveBeenCalledWith(null);
    expect(layers.get(TERRAIN_HILLSHADE_LAYER_ID)).toBeUndefined();
  });
});
