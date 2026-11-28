import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as maplibregl from 'maplibre-gl';
import { setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

// Register bundled worker URL with MapLibre to avoid Worker failed to load in Vite
if (typeof setWorkerUrl === 'function') {
  setWorkerUrl(workerUrl);
}

import { db } from '../../db/client';
import { databaseService } from '../../db/DatabaseService';
import { Property, Unit } from '../../db/schema';
import { usePack } from '../../countries/usePack';
import { formatMoney } from '../../lib/money';
import { getUnitDisplayName } from '../../lib/formatNames';
import {
  useAppSettingsStore,
  MapPositionState,
  MapLayerType,
} from '../../stores/appSettingsStore';
import { useToast } from '../../components/toast/ToastContext';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { generateUUID } from '../../lib/uuid';
import { sanitizeCoordinates, safeLngLatTuple, geocodeAddress } from '../../lib/geo';
import {
  MapPin,
  Search,
  Pencil,
  Trash2,
  X,
  Building2,
  ArrowRight,
  Map as MapIcon,
  Globe,
  TrendingUp,
  Moon,
  WifiOff,
  RefreshCw,
} from '../../components/icons';

export type { MapLayerType };

export type MapProviderTier = 'maptiler' | 'openfreemap' | 'osm';

export const BUILDING_3D_LAYER_ID = 'rentflow-3d-buildings';
export const TERRAIN_DEM_SOURCE_ID = 'rentflow-terrain-dem';
export const TERRAIN_HILLSHADE_LAYER_ID = 'rentflow-terrain-hillshade';

const VALID_MAP_LAYERS: ReadonlyArray<MapLayerType> = [
  'streets',
  'satellite',
  'terrain',
  'buildings3d',
  'dark',
];

const OPENFREEMAP_STYLES = {
  liberty: 'https://tiles.openfreemap.org/styles/liberty',
  dark: 'https://tiles.openfreemap.org/styles/dark',
} as const;

export function normalizeMapLayer(raw: unknown): MapLayerType {
  if (typeof raw === 'string' && VALID_MAP_LAYERS.includes(raw as MapLayerType)) {
    return raw as MapLayerType;
  }
  return 'streets';
}

export function getMapTilerApiKey(overrideKey?: string): string {
  const raw = overrideKey !== undefined ? overrideKey : import.meta.env.VITE_MAPTILER_API_KEY;
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (
    !trimmed ||
    trimmed === 'YOUR_KEY_HERE' ||
    trimmed === 'your_maptiler_api_key_here' ||
    trimmed === 'undefined' ||
    trimmed === 'null'
  ) {
    return '';
  }
  return trimmed;
}

export function resolveInitialProviderTier(apiKey: string): MapProviderTier {
  return apiKey ? 'maptiler' : 'openfreemap';
}

export function getProviderDisplayName(tier: MapProviderTier): string {
  switch (tier) {
    case 'maptiler':
      return 'MapTiler';
    case 'openfreemap':
      return 'OpenFreeMap';
    case 'osm':
    default:
      return 'OpenStreetMap';
  }
}

export function createOsmRasterStyle(): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: {
      'osm-tiles': {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        maxzoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      },
    },
    layers: [
      {
        id: 'osm-tiles-layer',
        type: 'raster',
        source: 'osm-tiles',
        minzoom: 0,
        maxzoom: 22,
      },
    ],
  };
}

export function createSatelliteFallbackStyle(): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: {
      'esri-world-imagery': {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        ],
        tileSize: 256,
        maxzoom: 19,
        attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics',
      },
      'satellite-city-labels': {
        type: 'raster',
        tiles: ['https://basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png'],
        tileSize: 256,
        maxzoom: 19,
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      },
    },
    layers: [
      {
        id: 'esri-world-imagery-layer',
        type: 'raster',
        source: 'esri-world-imagery',
        minzoom: 0,
        maxzoom: 22,
      },
      {
        id: 'satellite-city-labels-layer',
        type: 'raster',
        source: 'satellite-city-labels',
        minzoom: 0,
        maxzoom: 22,
      },
    ],
  };
}

export function getMapStyle(
  layer: MapLayerType,
  tier?: MapProviderTier,
  apiKeyOverride?: string
): string | maplibregl.StyleSpecification {
  const apiKey = getMapTilerApiKey(apiKeyOverride);
  const resolvedTier: MapProviderTier =
    tier ?? resolveInitialProviderTier(apiKey);

  if (resolvedTier === 'maptiler' && apiKey) {
    switch (layer) {
      case 'satellite':
        return `https://api.maptiler.com/maps/hybrid/style.json?key=${apiKey}`;
      case 'terrain':
        return `https://api.maptiler.com/maps/outdoor-v2/style.json?key=${apiKey}`;
      case 'dark':
        return `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${apiKey}`;
      case 'buildings3d':
      case 'streets':
      default:
        return `https://api.maptiler.com/maps/streets-v2/style.json?key=${apiKey}`;
    }
  }

  if (resolvedTier === 'openfreemap') {
    switch (layer) {
      case 'satellite':
        return createSatelliteFallbackStyle();
      case 'dark':
        return OPENFREEMAP_STYLES.dark;
      case 'terrain':
      case 'buildings3d':
      case 'streets':
      default:
        return OPENFREEMAP_STYLES.liberty;
    }
  }

  return createOsmRasterStyle();
}

export function findBuildingVectorSourceId(
  style: maplibregl.StyleSpecification | undefined
): string | null {
  if (!style || !style.sources) return null;

  // Prefer the source referenced by an existing 'building' source-layer
  if (Array.isArray(style.layers)) {
    for (const layer of style.layers) {
      const sourceLayer = (layer as { 'source-layer'?: unknown })['source-layer'];
      const sourceName = (layer as { source?: unknown }).source;
      if (sourceLayer === 'building' && typeof sourceName === 'string' && style.sources[sourceName]) {
        return sourceName;
      }
    }
  }

  // Fallback: well-known OpenMapTiles / MapTiler vector source keys
  for (const preferred of ['openmaptiles', 'maptiler_planet']) {
    const src = style.sources[preferred];
    if (src && src.type === 'vector') {
      return preferred;
    }
  }

  // Last fallback: first vector source in the style
  for (const [sourceId, src] of Object.entries(style.sources)) {
    if (src && src.type === 'vector') {
      return sourceId;
    }
  }

  return null;
}

export function findFirstSymbolLabelLayerId(
  style: maplibregl.StyleSpecification | undefined
): string | undefined {
  if (!style || !Array.isArray(style.layers)) return undefined;
  for (const layer of style.layers) {
    if (layer.type === 'symbol') {
      const layout = layer.layout as Record<string, unknown> | undefined;
      if (layout && layout['text-field'] !== undefined) {
        return layer.id;
      }
    }
  }
  return undefined;
}

export function apply3DBuildingsLayer(map: maplibregl.Map): boolean {
  let style: maplibregl.StyleSpecification | undefined;
  try {
    style = map.getStyle();
  } catch {
    return false;
  }

  const vectorSourceId = findBuildingVectorSourceId(style);
  if (!vectorSourceId) {
    return false;
  }

  // Hide any pre-existing 3D building extrusion layers in the base style to avoid z-fighting
  if (Array.isArray(style?.layers)) {
    for (const layer of style.layers) {
      if (layer.id !== BUILDING_3D_LAYER_ID && layer.type === 'fill-extrusion') {
        try {
          map.setLayoutProperty(layer.id, 'visibility', 'none');
        } catch {
          // Ignore immutable or unloaded layer
        }
      }
    }
  }

  try {
    if (map.getLayer(BUILDING_3D_LAYER_ID)) {
      map.removeLayer(BUILDING_3D_LAYER_ID);
    }

    const labelLayerId = findFirstSymbolLabelLayerId(style);
    map.addLayer(
      {
        id: BUILDING_3D_LAYER_ID,
        source: vectorSourceId,
        'source-layer': 'building',
        type: 'fill-extrusion',
        minzoom: 13,
        filter: ['!=', ['get', 'hide_3d'], true],
        paint: {
          'fill-extrusion-color': [
            'interpolate',
            ['linear'],
            ['coalesce', ['get', 'render_height'], ['get', 'height'], 12],
            0,
            '#cbd5e1',
            20,
            '#94a3b8',
            55,
            '#64748b',
            110,
            '#475569',
          ],
          'fill-extrusion-height': [
            'interpolate',
            ['linear'],
            ['zoom'],
            13,
            0,
            14.2,
            ['coalesce', ['get', 'render_height'], ['get', 'height'], 12],
          ],
          'fill-extrusion-base': [
            'coalesce',
            ['get', 'render_min_height'],
            ['get', 'min_height'],
            0,
          ],
          'fill-extrusion-opacity': 0.88,
          'fill-extrusion-vertical-gradient': true,
        },
      },
      labelLayerId
    );

    if (typeof map.setLight === 'function') {
      map.setLight({
        anchor: 'viewport',
        color: '#ffffff',
        intensity: 0.45,
        position: [1.5, 180, 45],
      });
    }

    return true;
  } catch {
    return false;
  }
}

export function applyTerrainLayer(
  map: maplibregl.Map,
  tier: MapProviderTier,
  apiKey: string
): boolean {
  if (tier === 'osm') {
    return false;
  }

  try {
    if (!map.getSource(TERRAIN_DEM_SOURCE_ID)) {
      if (tier === 'maptiler' && apiKey) {
        map.addSource(TERRAIN_DEM_SOURCE_ID, {
          type: 'raster-dem',
          url: `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${apiKey}`,
          tileSize: 256,
        });
      } else {
        map.addSource(TERRAIN_DEM_SOURCE_ID, {
          type: 'raster-dem',
          tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
          encoding: 'terrarium',
          tileSize: 256,
          maxzoom: 15,
        });
      }
    }

    if (!map.getLayer(TERRAIN_HILLSHADE_LAYER_ID)) {
      const labelLayerId = findFirstSymbolLabelLayerId(map.getStyle());
      map.addLayer(
        {
          id: TERRAIN_HILLSHADE_LAYER_ID,
          type: 'hillshade',
          source: TERRAIN_DEM_SOURCE_ID,
          paint: {
            'hillshade-shadow-color': '#334155',
            'hillshade-highlight-color': '#f8fafc',
            'hillshade-exaggeration': 0.35,
          },
        },
        labelLayerId
      );
    }

    if (typeof map.setTerrain === 'function') {
      map.setTerrain({ source: TERRAIN_DEM_SOURCE_ID, exaggeration: 1.5 });
    }
    return true;
  } catch {
    return false;
  }
}

export function clear3DEnhancements(map: maplibregl.Map): void {
  try {
    if (typeof map.setTerrain === 'function') {
      map.setTerrain(null);
    }
  } catch {
    // Ignore when terrain is unset
  }

  try {
    if (map.getLayer(BUILDING_3D_LAYER_ID)) {
      map.removeLayer(BUILDING_3D_LAYER_ID);
    }
  } catch {
    // Ignore if style is transitioning
  }

  try {
    if (map.getLayer(TERRAIN_HILLSHADE_LAYER_ID)) {
      map.removeLayer(TERRAIN_HILLSHADE_LAYER_ID);
    }
  } catch {
    // Ignore if style is transitioning
  }
}

interface LayerOption {
  id: MapLayerType;
  label: string;
  Icon: React.FC<{ className?: string }>;
}

const LAYER_OPTIONS: ReadonlyArray<LayerOption> = [
  { id: 'streets', label: 'Streets', Icon: MapIcon },
  { id: 'satellite', label: 'Satellite', Icon: Globe },
  { id: 'terrain', label: 'Terrain', Icon: TrendingUp },
  { id: 'buildings3d', label: '3D Buildings', Icon: Building2 },
  { id: 'dark', label: 'Dark Mode', Icon: Moon },
];

export const MapComponent: React.FC = () => {
  const navigate = useNavigate();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const markerCleanupsRef = useRef<Array<() => void>>([]);
  const draftMarkerRef = useRef<maplibregl.Marker | null>(null);
  const hasInitialFittedRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(true);

  const initialApiKey = getMapTilerApiKey();
  const initialTier = resolveInitialProviderTier(initialApiKey);
  const [providerTier, setProviderTier] = useState<MapProviderTier>(initialTier);
  const providerTierRef = useRef<MapProviderTier>(initialTier);
  const maptilerFailedRef = useRef<boolean>(!initialApiKey);
  const openFreeMapFailedRef = useRef<boolean>(false);
  const switchingTierRef = useRef<boolean>(false);

  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const isOnlineRef = useRef<boolean>(isOnline);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const pack = usePack();
  const { showToast } = useToast();

  const [properties, setProperties] = useState<Property[]>(() =>
    db.getTable<Property>('properties').filter((p) => !p.deleted_at && !(p as any).deletedAt)
  );
  const [units, setUnits] = useState<Unit[]>(() =>
    db.getTable<Unit>('units').filter((u) => !u.deleted_at && !(u as any).deletedAt)
  );

  // Map state persistence (lat, lng, zoom, layer) via centralized appSettingsStore
  const storedMapPos = useAppSettingsStore.getState().mapPosition;
  const savedState = (() => {
    if (!storedMapPos) return null;
    const coords = sanitizeCoordinates(
      storedMapPos.lat ?? storedMapPos.center_lat,
      storedMapPos.lng ?? storedMapPos.center_lng
    );
    if (!coords) return null;
    return {
      center_lat: coords.lat,
      center_lng: coords.lng,
      zoom: typeof storedMapPos.zoom === 'number' ? storedMapPos.zoom : 3.5,
      layer: normalizeMapLayer(storedMapPos.layer),
    };
  })();

  const [activeLayer, setActiveLayer] = useState<MapLayerType>(savedState?.layer || 'streets');
  const activeLayerRef = useRef<MapLayerType>(savedState?.layer || 'streets');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // Slide-over state
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [isSlideOverOpen, setIsSlideOverOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  // Property form state
  const [formName, setFormName] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formCity, setFormCity] = useState('');
  const [formType, setFormType] = useState<any>('residential_apartment');
  const [formNotes, setFormNotes] = useState('');
  const [formLat, setFormLat] = useState<number>(37.7749);
  const [formLng, setFormLng] = useState<number>(-122.4194);
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);

  // Delete modal
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [propertyToDelete, setPropertyToDelete] = useState<Property | null>(null);

  const getBestAvailableTier = useCallback((): MapProviderTier => {
    const key = getMapTilerApiKey();
    if (key && !maptilerFailedRef.current) return 'maptiler';
    if (!openFreeMapFailedRef.current) return 'openfreemap';
    return 'osm';
  }, []);

  const applyDynamicEnhancements = useCallback(
    (map: maplibregl.Map, layer: MapLayerType, tier: MapProviderTier) => {
      if (layer === 'buildings3d') {
        try {
          if (typeof map.setTerrain === 'function') {
            map.setTerrain(null);
          }
        } catch {
          // Ignore terrain reset errors
        }
        apply3DBuildingsLayer(map);
      } else if (layer === 'terrain') {
        try {
          if (map.getLayer(BUILDING_3D_LAYER_ID)) {
            map.removeLayer(BUILDING_3D_LAYER_ID);
          }
        } catch {
          // Ignore missing layer
        }
        applyTerrainLayer(map, tier, getMapTilerApiKey());
      } else {
        clear3DEnhancements(map);
      }
    },
    []
  );

  const refreshMapTiles = useCallback(
    (resetFailureFlags = false) => {
      const map = mapRef.current;
      if (!map) return;

      if (resetFailureFlags) {
        maptilerFailedRef.current = !getMapTilerApiKey();
        openFreeMapFailedRef.current = false;
      }

      const nextTier = getBestAvailableTier();
      providerTierRef.current = nextTier;
      if (isMountedRef.current) {
        setProviderTier(nextTier);
      }

      try {
        map.setStyle(getMapStyle(activeLayerRef.current, nextTier), { diff: false });
      } catch {
        // Fallback: reload individual sources if style refresh throws mid-transition
        try {
          const style = map.getStyle();
          if (style?.sources) {
            Object.keys(style.sources).forEach((sourceId) => {
              const source = map.getSource(sourceId) as { load?: () => void } | undefined;
              if (source && typeof source.load === 'function') {
                source.load();
              }
            });
          }
          map.triggerRepaint();
        } catch {
          // Ignore
        }
      }
    },
    [getBestAvailableTier]
  );

  // Internet connection monitoring (navigator.onLine + online/offline listeners)
  useEffect(() => {
    const handleOnline = () => {
      isOnlineRef.current = true;
      if (isMountedRef.current) {
        setIsOnline(true);
      }
      refreshMapTiles(true);
    };

    const handleOffline = () => {
      isOnlineRef.current = false;
      if (isMountedRef.current) {
        setIsOnline(false);
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [refreshMapTiles]);

  // Subscribe to reactive database changes (e.g. when properties or units are added/edited)
  useEffect(() => {
    const unsub = db.onWrite(() => {
      setProperties(db.getTable<Property>('properties').filter((p) => !p.deleted_at && !(p as any).deletedAt));
      setUnits(db.getTable<Unit>('units').filter((u) => !u.deleted_at && !(u as any).deletedAt));
    });
    return unsub;
  }, []);

  // Self-heal and auto-geocode stored properties missing coordinates
  useEffect(() => {
    if (!isOnline) return;
    let isCancelled = false;
    const healAndGeocodeAll = async () => {
      const allProps = db
        .getTable<Property>('properties')
        .filter((p) => !p.deleted_at && !(p as any).deletedAt);
      let hasChanged = false;

      for (const p of allProps) {
        const rawLat = p.latitude ?? p.lat;
        const rawLng = p.longitude ?? p.lng;
        const coords = sanitizeCoordinates(rawLat, rawLng);

        if (coords) {
          if (coords.lat !== rawLat || coords.lng !== rawLng) {
            db.updateItem<Property>('properties', p.id, {
              lat: coords.lat,
              lng: coords.lng,
              latitude: coords.lat,
              longitude: coords.lng,
            });
            hasChanged = true;
          }
        } else {
          const geocoded = await geocodeAddress(
            p.address_line1 || p.address || p.name,
            p.city,
            p.country_code || pack.code
          );
          if (geocoded && !isCancelled) {
            db.updateItem<Property>('properties', p.id, {
              lat: geocoded.lat,
              lng: geocoded.lng,
              latitude: geocoded.lat,
              longitude: geocoded.lng,
            });
            hasChanged = true;
          }
        }
      }

      if (hasChanged && !isCancelled) {
        setProperties(db.getTable<Property>('properties').filter((p) => !p.deleted_at));
      }
    };

    healAndGeocodeAll();
    return () => {
      isCancelled = true;
    };
  }, [pack.code, isOnline]);

  const fitToAllProperties = () => {
    const map = mapRef.current;
    if (!map) return;
    const allProps = db
      .getTable<Property>('properties')
      .filter((p) => !p.deleted_at && !(p as any).deletedAt);
    const validCoords: [number, number][] = [];
    allProps.forEach((p) => {
      const rawLat = p.latitude ?? p.lat;
      const rawLng = p.longitude ?? p.lng;
      const tuple = safeLngLatTuple(rawLat, rawLng);
      if (tuple) validCoords.push(tuple);
    });

    if (validCoords.length === 0) {
      showToast({ type: 'info', message: 'No property coordinates to frame.' });
      return;
    }
    if (validCoords.length === 1) {
      map.flyTo({ center: validCoords[0], zoom: 14, speed: 1.2 });
      return;
    }

    const bounds = new maplibregl.LngLatBounds(validCoords[0], validCoords[0]);
    validCoords.forEach((coord) => bounds.extend(coord));
    map.fitBounds(bounds, { padding: 80, maxZoom: 15, duration: 1000 });
  };

  // Reverse geocoding helper
  const reverseGeocode = async (rawLat: number, rawLng: number) => {
    const coords = sanitizeCoordinates(rawLat, rawLng);
    if (!coords) return;
    const { lat, lng } = coords;

    if (!isOnlineRef.current) {
      if (isMountedRef.current) {
        setFormAddress(`Pinned at ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      }
      return;
    }

    if (isMountedRef.current) setIsReverseGeocoding(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
        {
          signal: controller.signal,
          headers: {
            Accept: 'application/json',
          },
        }
      );
      clearTimeout(timeoutId);
      if (!res.ok) {
        throw new Error(`Reverse geocoding error: ${res.status}`);
      }
      const data = await res.json();
      if (!isMountedRef.current) return;
      if (data && data.address) {
        const road = data.address.road || data.address.pedestrian || data.address.suburb || '';
        const houseNumber = data.address.house_number ? `${data.address.house_number} ` : '';
        const city =
          data.address.city ||
          data.address.town ||
          data.address.village ||
          data.address.county ||
          'Metro Area';
        const formatted = houseNumber + road || data.display_name.split(',')[0];
        setFormAddress(formatted);
        setFormCity(city);
      }
    } catch {
      if (isMountedRef.current) {
        setFormAddress(`Pinned at ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      }
    } finally {
      if (isMountedRef.current) setIsReverseGeocoding(false);
    }
  };

  // Initialize MapLibre GL
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const initialCenter: [number, number] = [
      savedState?.center_lng ?? -96,
      savedState?.center_lat ?? 38.5,
    ];
    const initialZoom = savedState?.zoom ?? 3.5;
    const startingLayer = activeLayerRef.current;
    const startingPitch = startingLayer === 'buildings3d' ? 60 : startingLayer === 'terrain' ? 45 : 0;
    const startingBearing = startingLayer === 'buildings3d' ? -17.6 : 0;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: getMapStyle(startingLayer, providerTierRef.current),
      center: initialCenter,
      zoom: initialZoom,
      pitch: startingPitch,
      bearing: startingBearing,
      maxPitch: 85,
    });

    map.on('style.load', () => {
      switchingTierRef.current = false;
      applyDynamicEnhancements(map, activeLayerRef.current, providerTierRef.current);
    });

    map.on('error', (evt: any) => {
      // Do not trigger provider downgrade if the user is offline or already switching tiers
      if (!isOnlineRef.current || switchingTierRef.current) return;
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;

      const errObj = evt?.error as { status?: number; message?: string } | undefined;
      const status = typeof errObj?.status === 'number' ? errObj.status : 0;
      const message = typeof errObj?.message === 'string' ? errObj.message : '';
      const isAuthOrStyleFailure =
        status === 401 ||
        status === 403 ||
        status === 404 ||
        status === 429 ||
        status >= 500 ||
        !evt?.sourceId ||
        /failed to fetch|unauthorized|forbidden|networkerror|load failed|style/i.test(message);

      if (!isAuthOrStyleFailure) return;

      if (providerTierRef.current === 'maptiler') {
        switchingTierRef.current = true;
        maptilerFailedRef.current = true;
        providerTierRef.current = 'openfreemap';
        if (isMountedRef.current) {
          setProviderTier('openfreemap');
        }
        try {
          map.setStyle(getMapStyle(activeLayerRef.current, 'openfreemap'));
        } catch {
          switchingTierRef.current = false;
        }
      } else if (providerTierRef.current === 'openfreemap') {
        switchingTierRef.current = true;
        openFreeMapFailedRef.current = true;
        providerTierRef.current = 'osm';
        if (isMountedRef.current) {
          setProviderTier('osm');
        }
        try {
          map.setStyle(getMapStyle(activeLayerRef.current, 'osm'));
        } catch {
          switchingTierRef.current = false;
        }
      }
    });

    map.addControl(
      new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }),
      'bottom-right'
    );

    // Click map to drop pin
    map.on('click', (e: any) => {
      if (!e || !e.lngLat) return;
      const coords = sanitizeCoordinates(e.lngLat.lat, e.lngLat.lng);
      if (!coords) return;
      const { lat, lng } = coords;

      if (!draftMarkerRef.current) {
        const el = document.createElement('div');
        el.className = 'rentflow-draft-marker cursor-grab';
        el.innerHTML = `
          <div style="background-color: #4F46E5; color: white; width: 38px; height: 38px; border-radius: 9999px; display: flex; align-items: center; justify-content: center; box-shadow: 0 10px 25px rgba(79,70,229,0.4); border: 3px solid white;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
          </div>
        `;

        try {
          const marker = new maplibregl.Marker({ element: el, draggable: true })
            .setLngLat([lng, lat])
            .addTo(map);

          marker.on('dragend', () => {
            const pos = marker.getLngLat();
            if (!pos) return;
            const safe = sanitizeCoordinates(pos.lat, pos.lng);
            if (!safe) return;
            setFormLat(safe.lat);
            setFormLng(safe.lng);
            reverseGeocode(safe.lat, safe.lng);
          });

          draftMarkerRef.current = marker;
        } catch {
          // Ignore marker placement issues on unmounted state
        }
      } else {
        try {
          draftMarkerRef.current.setLngLat([lng, lat]);
        } catch {
          // Ignore
        }
      }

      setFormLat(lat);
      setFormLng(lng);
      setFormName('');
      setFormNotes('');
      setFormType('residential_apartment');
      setSelectedProperty(null);
      setIsCreatingNew(true);
      setIsEditMode(true);
      setIsSlideOverOpen(true);

      reverseGeocode(lat, lng);
    });

    const persistMapPosition = () => {
      const center = map.getCenter();
      const zoom = map.getZoom();
      const coords = sanitizeCoordinates(center.lat, center.lng);
      if (coords) {
        const nextPos: MapPositionState = {
          lat: coords.lat,
          lng: coords.lng,
          center_lat: coords.lat,
          center_lng: coords.lng,
          zoom: Math.round(zoom * 100) / 100,
          layer: activeLayerRef.current,
        };
        useAppSettingsStore.getState().setMapPosition(nextPos);
        void databaseService.saveSetting('mapPosition', nextPos);
      }
    };

    map.on('moveend', persistMapPosition);
    map.on('zoomend', persistMapPosition);

    mapRef.current = map;

    return () => {
      markerCleanupsRef.current.forEach((cleanup) => cleanup());
      markerCleanupsRef.current = [];
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      if (draftMarkerRef.current) {
        draftMarkerRef.current.remove();
        draftMarkerRef.current = null;
      }
      map.remove();
      mapRef.current = null;
    };
  }, [applyDynamicEnhancements]);

  const handleLayerSwitch = (layer: MapLayerType) => {
    const prevLayer = activeLayerRef.current;
    setActiveLayer(layer);
    activeLayerRef.current = layer;
    const map = mapRef.current;
    if (!map) return;

    const currentTier = providerTierRef.current;
    const prevStyle = getMapStyle(prevLayer, currentTier);
    const nextStyle = getMapStyle(layer, currentTier);

    const isSameBaseStyle =
      typeof prevStyle === 'string' && typeof nextStyle === 'string' && prevStyle === nextStyle;

    if (isSameBaseStyle && map.isStyleLoaded()) {
      applyDynamicEnhancements(map, layer, currentTier);
    } else {
      map.setStyle(nextStyle);
    }

    // Apply camera tilt / perspective per mode
    if (layer === 'buildings3d') {
      const targetZoom = map.getZoom() < 14.5 ? 15.2 : map.getZoom();
      map.easeTo({
        pitch: 60,
        bearing: -17.6,
        zoom: targetZoom,
        duration: 750,
      });
    } else if (layer === 'terrain') {
      map.easeTo({
        pitch: 45,
        bearing: 0,
        duration: 700,
      });
    } else {
      map.easeTo({
        pitch: 0,
        bearing: 0,
        duration: 600,
      });
    }

    const center = map.getCenter();
    const zoom = map.getZoom();
    const coords = sanitizeCoordinates(center.lat, center.lng);
    const nextPos: MapPositionState = {
      lat: coords?.lat ?? center.lat,
      lng: coords?.lng ?? center.lng,
      center_lat: coords?.lat ?? center.lat,
      center_lng: coords?.lng ?? center.lng,
      zoom: Math.round(zoom * 100) / 100,
      layer,
    };
    useAppSettingsStore.getState().setMapPosition(nextPos);
    void databaseService.saveSetting('mapPosition', nextPos);
  };

  // Render Indigo SVG property markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markerCleanupsRef.current.forEach((cleanup) => cleanup());
    markerCleanupsRef.current = [];
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const validTuples: [number, number][] = [];

    properties.forEach((prop) => {
      if (prop.deleted_at || (prop as any).deletedAt) return;
      const rawLat = prop.latitude ?? prop.lat;
      const rawLng = prop.longitude ?? prop.lng;
      const tuple = safeLngLatTuple(rawLat, rawLng);

      if (tuple) {
        validTuples.push(tuple);
        const el = document.createElement('div');
        el.className = 'rentflow-marker cursor-pointer group';
        el.innerHTML = `
          <div style="background-color: #4F46E5; color: white; width: 36px; height: 36px; border-radius: 9999px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 14px rgba(79,70,229,0.35); border: 2.5px solid white; transition: transform 0.15s ease;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
          </div>
        `;

        const handleClick = (e: MouseEvent) => {
          e.stopPropagation();
          handleOpenPropertySlideOver(prop);
        };
        el.addEventListener('click', handleClick);
        markerCleanupsRef.current.push(() => el.removeEventListener('click', handleClick));

        try {
          const marker = new maplibregl.Marker({ element: el }).setLngLat(tuple).addTo(map);
          markersRef.current.push(marker);
        } catch {
          // Skip invalid marker coordinates silently
        }
      }
    });

    // Auto-fit bounds on initial mount if there are valid property coordinates and no manual saved position
    if (!hasInitialFittedRef.current && validTuples.length > 0 && !savedState) {
      hasInitialFittedRef.current = true;
      if (validTuples.length === 1) {
        map.flyTo({ center: validTuples[0], zoom: 13 });
      } else {
        const bounds = new maplibregl.LngLatBounds(validTuples[0], validTuples[0]);
        validTuples.forEach((t) => bounds.extend(t));
        map.fitBounds(bounds, { padding: 80, maxZoom: 14 });
      }
    }

    return () => {
      markerCleanupsRef.current.forEach((cleanup) => cleanup());
      markerCleanupsRef.current = [];
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
    };
  }, [properties, units]);

  const handleOpenPropertySlideOver = (prop: Property) => {
    if (draftMarkerRef.current) {
      draftMarkerRef.current.remove();
      draftMarkerRef.current = null;
    }

    const rawLat = prop.latitude ?? prop.lat;
    const rawLng = prop.longitude ?? prop.lng;
    const coords = sanitizeCoordinates(rawLat, rawLng);

    setSelectedProperty(prop);
    setIsCreatingNew(false);
    setIsEditMode(false);
    setFormName(prop.name);
    setFormAddress(prop.address_line1 || prop.address || '');
    setFormCity(prop.city || 'Metro Area');
    setFormType(prop.type || 'residential_apartment');
    setFormNotes(prop.notes || '');
    setFormLat(coords?.lat ?? 37.7749);
    setFormLng(coords?.lng ?? -122.4194);
    setIsSlideOverOpen(true);

    const tuple = safeLngLatTuple(rawLat, rawLng);
    if (tuple) {
      try {
        mapRef.current?.flyTo({
          center: tuple,
          zoom: Math.max(mapRef.current.getZoom(), 14),
          speed: 1.2,
        });
      } catch {
        // Ignore transition errors
      }
    }
  };

  const handleCloseSlideOver = () => {
    setIsSlideOverOpen(false);
    setIsEditMode(false);
    setIsCreatingNew(false);
    if (draftMarkerRef.current) {
      draftMarkerRef.current.remove();
      draftMarkerRef.current = null;
    }
  };

  const handleSaveProperty = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      showToast({ type: 'error', message: 'Property name is required!' });
      return;
    }
    if (!formAddress.trim()) {
      showToast({ type: 'error', message: 'Address is required!' });
      return;
    }

    const coords = sanitizeCoordinates(formLat, formLng) || { lat: 37.7749, lng: -122.4194 };

    if (isCreatingNew) {
      const created = db.insertItem<Property>('properties', {
        id: generateUUID(),
        org_id: 'default_org',
        name: formName.trim(),
        address_line1: formAddress.trim(),
        address: formAddress.trim(),
        city: formCity.trim() || 'Metro Area',
        country_code: pack.code,
        type: formType,
        notes: formNotes.trim(),
        latitude: coords.lat,
        longitude: coords.lng,
        lat: coords.lat,
        lng: coords.lng,
      });

      setProperties(
        db.getTable<Property>('properties').filter((p) => !p.deleted_at && !(p as any).deletedAt)
      );
      setSelectedProperty(created);
      setIsCreatingNew(false);
      setIsEditMode(false);
      if (draftMarkerRef.current) {
        draftMarkerRef.current.remove();
        draftMarkerRef.current = null;
      }
      showToast({
        type: 'success',
        message: `Property "${created.name}" created at map coordinates!`,
      });
    } else if (selectedProperty) {
      const updated = db.updateItem<Property>('properties', selectedProperty.id, {
        name: formName.trim(),
        address_line1: formAddress.trim(),
        address: formAddress.trim(),
        city: formCity.trim(),
        type: formType,
        notes: formNotes.trim(),
        latitude: coords.lat,
        longitude: coords.lng,
        lat: coords.lat,
        lng: coords.lng,
      });

      setProperties(
        db.getTable<Property>('properties').filter((p) => !p.deleted_at && !(p as any).deletedAt)
      );
      setSelectedProperty(updated);
      setIsEditMode(false);
      showToast({ type: 'success', message: `Property "${formName}" updated successfully` });
    }
  };

  const handleDeleteClick = () => {
    if (!selectedProperty) return;
    setPropertyToDelete(selectedProperty);
    setIsDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = () => {
    if (!propertyToDelete) return;
    const propName = propertyToDelete.name;
    const success = db.deletePropertyCascading(propertyToDelete.id);
    if (success) {
      setProperties(
        db.getTable<Property>('properties').filter((p) => !p.deleted_at && !(p as any).deletedAt)
      );
      setIsDeleteConfirmOpen(false);
      handleCloseSlideOver();
      showToast({
        type: 'info',
        message: `Property "${propName}" and associated units archived`,
      });
    }
  };

  const handleSearchLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) return;

    // Support direct "lat, lng" search even offline
    const coordMatch = trimmedQuery.match(
      /^\s*([-+]?\d{1,3}(?:\.\d+)?)\s*,\s*([-+]?\d{1,3}(?:\.\d+)?)\s*$/
    );
    if (coordMatch) {
      const tuple = safeLngLatTuple(coordMatch[1], coordMatch[2]);
      if (tuple) {
        mapRef.current?.flyTo({ center: tuple, zoom: 14, speed: 1.4 });
        showToast({
          type: 'info',
          message: `Flew to ${tuple[1].toFixed(4)}, ${tuple[0].toFixed(4)}`,
        });
        return;
      }
    }

    if (!isOnlineRef.current) {
      showToast({
        type: 'error',
        message: 'You are offline. Enter coordinates (lat, lng) or reconnect to search addresses.',
      });
      return;
    }

    if (isMountedRef.current) setIsSearching(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          trimmedQuery
        )}&limit=1`,
        {
          signal: controller.signal,
          headers: {
            Accept: 'application/json',
          },
        }
      );
      clearTimeout(timeoutId);

      if (!res.ok) {
        if (isMountedRef.current) {
          showToast({
            type: 'error',
            message: 'Location search service is temporarily unavailable. Please try again.',
          });
        }
        return;
      }

      const data = await res.json();
      if (!isMountedRef.current) return;
      if (Array.isArray(data) && data.length > 0) {
        const item = data[0];
        const tuple = safeLngLatTuple(item.lat, item.lon);
        if (tuple) {
          mapRef.current?.flyTo({ center: tuple, zoom: 13, speed: 1.4 });
          showToast({
            type: 'info',
            message: `Flew to ${String(item.display_name || trimmedQuery).split(',')[0]}`,
          });
        } else {
          showToast({ type: 'error', message: 'Location found, but coordinates are out of bounds.' });
        }
      } else {
        showToast({ type: 'error', message: 'Location not found. Try a different query.' });
      }
    } catch {
      if (isMountedRef.current) {
        showToast({ type: 'error', message: 'Search failed. Check network connection.' });
      }
    } finally {
      if (isMountedRef.current) setIsSearching(false);
    }
  };

  const handleRetryConnection = () => {
    const nowOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    isOnlineRef.current = nowOnline;
    setIsOnline(nowOnline);
    if (nowOnline) {
      refreshMapTiles(true);
    } else {
      showToast({
        type: 'info',
        message: 'Still offline. Map tiles will load automatically when internet returns.',
      });
    }
  };

  const selectedUnits = selectedProperty
    ? units.filter((u) => u.property_id === selectedProperty.id)
    : [];
  const totalRentMinor = selectedUnits.reduce((acc, u) => acc + u.rent_minor, 0);
  const providerLabel = getProviderDisplayName(providerTier);

  return (
    <div className="relative h-[calc(100vh-140px)] min-h-[550px] rounded-3xl border border-[var(--border-subtle)] overflow-hidden card-shadow bg-[var(--bg-surface)]">
      {/* Edge-to-Edge Map Canvas */}
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Friendly Offline Overlay */}
      {!isOnline && (
        <div
          role="status"
          aria-live="polite"
          data-testid="map-offline-overlay"
          className="absolute inset-0 z-[15] flex items-center justify-center p-6 bg-[var(--bg-base)]/80 backdrop-blur-md"
        >
          <div className="solid-menu-surface bg-[var(--bg-surface)] rounded-2xl p-6 max-w-md w-full text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)] flex items-center justify-center mx-auto">
              <WifiOff className="w-6 h-6" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-[var(--text-primary)] tracking-tight">
                No Internet Connection
              </h3>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                You are currently offline. The map requires an internet connection to load tiles.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-1">
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleRetryConnection}
                className="gap-1.5 whitespace-nowrap shrink-0"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry Connection</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => navigate('/properties')}
                className="whitespace-nowrap shrink-0"
              >
                View Properties
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Top-Left Search & Map Mode Control Panel (Solid Opaque) */}
      <div className="absolute top-4 left-4 z-20 w-[340px] sm:w-[500px] max-w-[calc(100%-2rem)] rounded-2xl solid-menu-surface bg-[var(--bg-surface)] p-4 space-y-3">
        {/* Row 1: Title, clean unboxed metadata, and Fit All primary utility */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-[var(--accent)] text-white flex items-center justify-center shrink-0">
              <MapPin className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-[var(--text-primary)] tracking-tight truncate">
                Portfolio Map
              </h3>
              <div className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] truncate">
                <span className="tabular-nums">{properties.length} Active Pins</span>
                <span aria-hidden="true">&middot;</span>
                <span>{providerLabel}</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={fitToAllProperties}
            title="Fit map view to all property locations"
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[var(--accent)] bg-[var(--accent-subtle)] hover:bg-[var(--accent)] hover:text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            Fit All
          </button>
        </div>

        {/* Row 2: Search bar */}
        <form onSubmit={handleSearchLocation} className="flex gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[var(--text-subtle)] pointer-events-none" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search city, address, or lat, lng..."
              aria-label="Search map location"
              className="w-full h-8 pl-8 pr-2.5 text-xs rounded-xl border border-[var(--border-strong)] bg-[var(--bg-base)] text-[var(--text-primary)] focus-ring"
            />
          </div>
          <Button
            variant="primary"
            size="sm"
            type="submit"
            disabled={isSearching}
            className="h-8 px-3 text-xs whitespace-nowrap shrink-0"
          >
            {isSearching ? 'Searching...' : 'Go'}
          </Button>
        </form>

        {/* Row 3: 5-Mode Interactive Map Switcher */}
        <div
          role="group"
          aria-label="Map layer modes"
          className="flex items-center gap-1 p-1 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)] overflow-x-auto"
        >
          {LAYER_OPTIONS.map(({ id, label, Icon }) => {
            const isActive = activeLayer === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={isActive}
                onClick={() => handleLayerSwitch(id)}
                className={`flex items-center justify-center gap-1.5 flex-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'bg-[var(--accent)] text-white shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)]'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        <p className="text-[11px] text-[var(--text-subtle)]">
          Click any location to drop a draggable pin and register a property.
        </p>
      </div>

      {/* 400px Right Slide-Over Panel with Frosted Blur Backdrop */}
      {isSlideOverOpen && (
        <>
          <div
            onClick={handleCloseSlideOver}
            className="menu-backdrop-blur !absolute inset-0 z-[25] animate-in fade-in duration-150"
            aria-hidden="true"
          />
          <div className="absolute top-0 right-0 bottom-0 w-full sm:w-[400px] solid-menu-surface bg-[var(--bg-surface)] border-l border-[var(--border-strong)] z-30 flex flex-col justify-between overflow-y-auto animate-in slide-in-from-right duration-200">
            {/* Header */}
            <div className="p-5 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[var(--accent-subtle)] text-[var(--accent)] flex items-center justify-center shrink-0">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)] tracking-tight">
                    {isCreatingNew
                      ? 'Add Property from Map'
                      : isEditMode
                      ? 'Edit Property'
                      : selectedProperty?.name}
                  </h3>
                  <p className="text-[11px] text-[var(--text-secondary)] font-mono tabular-nums">
                    {formLat.toFixed(5)}, {formLng.toFixed(5)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseSlideOver}
                aria-label="Close property panel"
                className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-base)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 flex-1 space-y-5 overflow-y-auto">
              {isEditMode ? (
                <form onSubmit={handleSaveProperty} id="slideover-prop-form" className="space-y-4">
                  {isReverseGeocoding && (
                    <div className="p-2.5 rounded-xl bg-[var(--accent-subtle)] text-[var(--accent)] text-xs flex items-center gap-2">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                      <span>Looking up street address...</span>
                    </div>
                  )}

                  <Input
                    label="Property Name *"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. Marina Heights Apartments"
                    required
                  />

                  <Input
                    label="Street Address *"
                    value={formAddress}
                    onChange={(e) => setFormAddress(e.target.value)}
                    placeholder="Full street address"
                    required
                  />

                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      label="City / Region"
                      value={formCity}
                      onChange={(e) => setFormCity(e.target.value)}
                      placeholder="e.g. Springfield"
                    />
                    <Select
                      label="Type"
                      value={formType}
                      onChange={(e) => setFormType(e.target.value)}
                    >
                      <option value="residential_apartment">Residential Apartment</option>
                      <option value="single_family">Single Family</option>
                      <option value="commercial">Commercial</option>
                      <option value="mixed_use">Mixed Use</option>
                      <option value="land">Vacant Land</option>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      label="Latitude"
                      type="number"
                      step="any"
                      value={formLat}
                      onChange={(e) => setFormLat(parseFloat(e.target.value) || 0)}
                    />
                    <Input
                      label="Longitude"
                      type="number"
                      step="any"
                      value={formLng}
                      onChange={(e) => setFormLng(parseFloat(e.target.value) || 0)}
                    />
                  </div>

                  <Input
                    label="Notes"
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="Key lockbox, parking rules, notes"
                  />
                </form>
              ) : selectedProperty ? (
                <div className="space-y-5 text-xs">
                  <div className="p-4 rounded-2xl bg-[var(--bg-base)] border border-[var(--border-subtle)] space-y-1">
                    <span className="text-xs font-semibold text-[var(--text-subtle)] block">
                      Address
                    </span>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      {selectedProperty.address_line1 || selectedProperty.address}
                    </p>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {selectedProperty.city || 'Metro Area'} &middot; {selectedProperty.country_code}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-4 rounded-2xl bg-[var(--bg-base)] border border-[var(--border-subtle)]">
                      <span className="text-xs font-semibold text-[var(--text-subtle)] block">
                        Total Units
                      </span>
                      <span className="text-lg font-bold tabular-nums text-[var(--text-primary)]">
                        {selectedUnits.length}
                      </span>
                    </div>

                    <div className="p-4 rounded-2xl bg-[var(--bg-base)] border border-[var(--border-subtle)]">
                      <span className="text-xs font-semibold text-[var(--text-subtle)] block">
                        Rent Roll
                      </span>
                      <span className="text-lg font-bold number-tabular text-[var(--accent)]">
                        {formatMoney(totalRentMinor, pack)}
                      </span>
                    </div>
                  </div>

                  {/* Units List */}
                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-[var(--text-subtle)] block">
                      Property Units
                    </span>
                    {selectedUnits.length === 0 ? (
                      <p className="text-xs text-[var(--text-subtle)] italic">
                        No units registered yet.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {selectedUnits.map((u) => (
                          <div
                            key={u.id}
                            className="p-3 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)] flex items-center justify-between gap-2"
                          >
                            <span className="font-bold text-sm text-[var(--text-primary)] truncate min-w-0">
                              {getUnitDisplayName(u)}
                            </span>
                            <span className="font-mono text-xs font-bold text-[var(--text-primary)] shrink-0">
                              {formatMoney(u.rent_minor, pack)}/mo
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            {/* Slide-Over Sticky Footer */}
            <div className="p-5 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)]">
              {isEditMode ? (
                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 whitespace-nowrap"
                    onClick={() => {
                      if (isCreatingNew) handleCloseSlideOver();
                      else setIsEditMode(false);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    form="slideover-prop-form"
                    variant="primary"
                    className="flex-1 whitespace-nowrap"
                  >
                    {isCreatingNew ? 'Create Property' : 'Save Changes'}
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs whitespace-nowrap"
                    onClick={() => setIsEditMode(true)}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>Edit</span>
                  </Button>

                  <Button
                    variant="danger"
                    size="sm"
                    className="gap-1.5 text-xs whitespace-nowrap"
                    onClick={handleDeleteClick}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </Button>

                  <Button
                    variant="primary"
                    size="sm"
                    className="gap-1.5 text-xs whitespace-nowrap"
                    onClick={() => navigate('/properties')}
                  >
                    <span>Details</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={isDeleteConfirmOpen}
        onClose={() => setIsDeleteConfirmOpen(false)}
        title="Delete Property from Map?"
        maxWidth="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-secondary)]">
            Are you sure you want to remove this property? It will be archived from both the map
            and your property portfolio.
          </p>
          <div className="flex justify-end gap-3 pt-3 border-t border-[var(--border-subtle)]">
            <Button variant="outline" onClick={() => setIsDeleteConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleConfirmDelete}>
              Confirm Delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default MapComponent;
