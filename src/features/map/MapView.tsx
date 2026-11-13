import React, { useEffect, useRef, useState } from 'react';
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
import { useAppSettingsStore, MapPositionState } from '../../stores/appSettingsStore';
import { useToast } from '../../components/toast/ToastContext';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { generateUUID } from '../../lib/uuid';
import { sanitizeCoordinates, safeLngLatTuple, geocodeAddress } from '../../lib/geo';
import {
  MapPin,
  Search,
  Layers,
  Copy,
  ExternalLink,
  Plus,
  Navigation,
  Check,
  Pencil,
  Trash2,
  X,
  Building2,
  ArrowRight,
  Info,
} from '../../components/icons';

type MapLayerType = 'streets' | 'satellite' | 'terrain';

const TILE_SOURCES: Record<MapLayerType, { tiles: string[]; maxzoom: number; attribution: string }> = {
  streets: {
    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    maxzoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  },
  satellite: {
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    maxzoom: 19,
    attribution: '&copy; Esri World Imagery',
  },
  terrain: {
    tiles: ['https://a.tile.opentopomap.org/{z}/{x}/{y}.png'],
    maxzoom: 17,
    attribution: '&copy; OpenTopoMap contributors',
  },
};

export const MapView: React.FC = () => {
  const navigate = useNavigate();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const markerCleanupsRef = useRef<Array<() => void>>([]);
  const draftMarkerRef = useRef<maplibregl.Marker | null>(null);
  const hasInitialFittedRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(true);

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
  const units = db.getTable<Unit>('units').filter((u) => !u.deleted_at && !(u as any).deletedAt);

  // Map state persistence (lat, lng, zoom) via centralized appSettingsStore
  const storedMapPos = useAppSettingsStore.getState().mapPosition;
  const savedState = (() => {
    if (!storedMapPos) return null;
    const coords = sanitizeCoordinates(storedMapPos.lat ?? storedMapPos.center_lat, storedMapPos.lng ?? storedMapPos.center_lng);
    if (!coords) return null;
    return {
      center_lat: coords.lat,
      center_lng: coords.lng,
      zoom: typeof storedMapPos.zoom === 'number' ? storedMapPos.zoom : 3.5,
      layer: storedMapPos.layer || 'streets',
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

  // Subscribe to reactive database changes (e.g. when properties are added or edited)
  useEffect(() => {
    const unsub = db.onWrite(() => {
      setProperties(db.getTable<Property>('properties').filter((p) => !p.deleted_at));
    });
    return unsub;
  }, []);

  // Self-heal and auto-geocode stored properties missing coordinates
  useEffect(() => {
    let isCancelled = false;
    const healAndGeocodeAll = async () => {
      const allProps = db.getTable<Property>('properties').filter((p) => !p.deleted_at);
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
          // Property is missing coordinates (e.g., added via standard form without manual coordinates)
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
  }, [pack.code]);

  const fitToAllProperties = () => {
    const map = mapRef.current;
    if (!map) return;
    const allProps = db.getTable<Property>('properties').filter((p) => !p.deleted_at);
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

    if (isMountedRef.current) setIsReverseGeocoding(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
      );
      const data = await res.json();
      if (!isMountedRef.current) return;
      if (data && data.address) {
        const road = data.address.road || data.address.pedestrian || data.address.suburb || '';
        const houseNumber = data.address.house_number ? `${data.address.house_number} ` : '';
        const city = data.address.city || data.address.town || data.address.village || data.address.county || 'Metro Area';
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

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        sources: {
          'raster-tiles': {
            type: 'raster',
            tiles: TILE_SOURCES[activeLayer].tiles,
            tileSize: 256,
            maxzoom: TILE_SOURCES[activeLayer].maxzoom,
            attribution: TILE_SOURCES[activeLayer].attribution,
          },
        },
        layers: [
          {
            id: 'raster-layer',
            type: 'raster',
            source: 'raster-tiles',
            minzoom: 0,
            maxzoom: 22,
          },
        ],
      },
      center: initialCenter,
      zoom: initialZoom,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

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
        } catch (err) {
          console.warn('Failed to place draft marker:', err);
        }
      } else {
        try {
          draftMarkerRef.current.setLngLat([lng, lat]);
        } catch (err) {
          console.warn('Failed to update draft marker:', err);
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
  }, []);

  const handleLayerSwitch = (layer: MapLayerType) => {
    setActiveLayer(layer);
    activeLayerRef.current = layer;
    const map = mapRef.current;
    if (!map) return;

    if (map.getSource('raster-tiles')) {
      if (map.getLayer('raster-layer')) {
        map.removeLayer('raster-layer');
      }
      map.removeSource('raster-tiles');
      map.addSource('raster-tiles', {
        type: 'raster',
        tiles: TILE_SOURCES[layer].tiles,
        tileSize: 256,
        maxzoom: TILE_SOURCES[layer].maxzoom,
        attribution: TILE_SOURCES[layer].attribution,
      });
      map.addLayer({
        id: 'raster-layer',
        type: 'raster',
        source: 'raster-tiles',
        minzoom: 0,
        maxzoom: 22,
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
          const marker = new maplibregl.Marker({ element: el })
            .setLngLat(tuple)
            .addTo(map);

          markersRef.current.push(marker);
        } catch (err) {
          console.warn('Skipping invalid map marker coordinate:', tuple, err);
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
        mapRef.current?.flyTo({ center: tuple, zoom: 14, speed: 1.2 });
      } catch (err) {
        console.warn('flyTo failed:', err);
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
        org_id: 'org_demo_1',
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

      setProperties(db.getTable<Property>('properties').filter((p) => !p.deleted_at && !(p as any).deletedAt));
      setSelectedProperty(created);
      setIsCreatingNew(false);
      setIsEditMode(false);
      if (draftMarkerRef.current) {
        draftMarkerRef.current.remove();
        draftMarkerRef.current = null;
      }
      showToast({ type: 'success', message: `Property "${created.name}" created at map coordinates!` });
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

      setProperties(db.getTable<Property>('properties').filter((p) => !p.deleted_at && !(p as any).deletedAt));
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
      setProperties(db.getTable<Property>('properties').filter((p) => !p.deleted_at && !(p as any).deletedAt));
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
    if (!searchQuery.trim()) return;

    if (isMountedRef.current) setIsSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          searchQuery
        )}&limit=1`
      );
      const data = await res.json();
      if (!isMountedRef.current) return;
      if (data && data.length > 0) {
        const item = data[0];
        const tuple = safeLngLatTuple(item.lat, item.lon);
        if (tuple) {
          mapRef.current?.flyTo({ center: tuple, zoom: 13, speed: 1.4 });
          showToast({ type: 'info', message: `Flew to ${item.display_name.split(',')[0]}` });
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

  const selectedUnits = selectedProperty ? units.filter((u) => u.property_id === selectedProperty.id) : [];
  const totalRentMinor = selectedUnits.reduce((acc, u) => acc + u.rent_minor, 0);

  return (
    <div className="relative h-[calc(100vh-140px)] min-h-[550px] rounded-3xl border border-[var(--border-subtle)] overflow-hidden card-shadow">
      {/* Edge-to-Edge Map Canvas */}
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Floating Top-Left Search & Filter Card (Rounded Minimalism) */}
      <div className="absolute top-4 left-4 z-20 w-80 sm:w-96 rounded-2xl bg-[var(--bg-surface)]/95 backdrop-blur-md border border-[var(--border-strong)] p-4 modal-shadow space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-[var(--accent)] text-white flex items-center justify-center shrink-0">
              <MapPin className="w-3.5 h-3.5" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-[var(--text-primary)]">Portfolio Map</h3>
              <p className="text-[10px] text-[var(--text-secondary)]">{properties.length} Active Pins</p>
            </div>
          </div>

          {/* Layer switcher */}
          <div className="flex items-center p-1 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)] text-[11px]">
            <button
              onClick={() => handleLayerSwitch('streets')}
              className={`px-2 py-0.5 rounded-lg font-medium transition-colors cursor-pointer ${
                activeLayer === 'streets'
                  ? 'bg-[var(--accent)] text-white shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Streets
            </button>
            <button
              onClick={() => handleLayerSwitch('satellite')}
              className={`px-2 py-0.5 rounded-lg font-medium transition-colors cursor-pointer ${
                activeLayer === 'satellite'
                  ? 'bg-[var(--accent)] text-white shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Sat
            </button>
            <button
              onClick={() => handleLayerSwitch('terrain')}
              className={`px-2 py-0.5 rounded-lg font-medium transition-colors cursor-pointer ${
                activeLayer === 'terrain'
                  ? 'bg-[var(--accent)] text-white shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Terrain
            </button>
            <button
              onClick={fitToAllProperties}
              title="Fit map view to all property locations"
              className="px-2 py-0.5 rounded-lg font-semibold text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white transition-colors cursor-pointer ml-0.5"
            >
              Fit All
            </button>
          </div>
        </div>

        {/* Search bar inside floating card */}
        <form onSubmit={handleSearchLocation} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[var(--text-subtle)]" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search city or address..."
              className="w-full h-8 pl-8 pr-2 text-xs rounded-xl border border-[var(--border-strong)] bg-[var(--bg-base)] text-[var(--text-primary)] focus-ring"
            />
          </div>
          <Button variant="primary" size="sm" type="submit" disabled={isSearching} className="h-8 px-2.5 text-xs">
            {isSearching ? '...' : 'Go'}
          </Button>
        </form>

        <p className="text-[10px] text-[var(--text-subtle)]">
          Tip: Click any location to drop a draggable pin to create a property.
        </p>
      </div>

      {/* 400px Right Slide-Over Panel (Mac/Arc style) */}
      {isSlideOverOpen && (
        <div className="absolute top-0 right-0 bottom-0 w-full sm:w-[400px] bg-[var(--bg-surface)] border-l border-[var(--border-subtle)] modal-shadow z-30 flex flex-col justify-between overflow-y-auto animate-in slide-in-from-right duration-200">
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
                <p className="text-[11px] text-[var(--text-secondary)] font-mono">
                  {formLat.toFixed(5)}, {formLng.toFixed(5)}
                </p>
              </div>
            </div>
            <button
              onClick={handleCloseSlideOver}
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
                    <span className="w-2 h-2 rounded-full bg-[var(--accent)] animate-ping" />
                    <span>Reverse-geocoding address...</span>
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
                  <span className="text-[10px] font-bold text-[var(--text-subtle)] uppercase tracking-wider block">
                    Address
                  </span>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">
                    {selectedProperty.address_line1 || selectedProperty.address}
                  </p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {selectedProperty.city || 'Metro Area'} &bull; {selectedProperty.country_code}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-4 rounded-2xl bg-[var(--bg-base)] border border-[var(--border-subtle)]">
                    <span className="text-[10px] font-bold text-[var(--text-subtle)] uppercase tracking-wider block">
                      Total Units
                    </span>
                    <span className="text-lg font-bold text-[var(--text-primary)]">{selectedUnits.length}</span>
                  </div>

                  <div className="p-4 rounded-2xl bg-[var(--bg-base)] border border-[var(--border-subtle)]">
                    <span className="text-[10px] font-bold text-[var(--text-subtle)] uppercase tracking-wider block">
                      Rent Roll
                    </span>
                    <span className="text-lg font-bold number-tabular text-[var(--accent)]">
                      {formatMoney(totalRentMinor, pack)}
                    </span>
                  </div>
                </div>

                {/* Units List */}
                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-[var(--text-subtle)] uppercase tracking-wider block">
                    Property Units
                  </span>
                  {selectedUnits.length === 0 ? (
                    <p className="text-xs text-[var(--text-subtle)] italic">No units registered yet.</p>
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
                  className="flex-1"
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
                  className="flex-1"
                >
                  {isCreatingNew ? 'Create Property' : 'Save Changes'}
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => setIsEditMode(true)}
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>Edit</span>
                </Button>

                <Button
                  variant="danger"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={handleDeleteClick}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </Button>

                <Button
                  variant="primary"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => navigate('/properties')}
                >
                  <span>Details</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}
          </div>
        </div>
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
            Are you sure you want to delete this property? It will be soft-deleted from both the GIS map and your property portfolio.
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
