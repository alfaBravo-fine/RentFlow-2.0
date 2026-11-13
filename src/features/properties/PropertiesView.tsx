import React, { useState } from 'react';
import { db } from '../../db/client';
import { Lease, Property, Unit, Tenant, Credit, RentIncrease } from '../../db/schema';
import { usePack } from '../../countries/usePack';
import { formatMoney, parseMajorToMinor, minorToMajorNumber } from '../../lib/money';
import { generateUUID } from '../../lib/uuid';
import { sanitizeCoordinates, geocodeAddress } from '../../lib/geo';
import { getUnitDisplayName } from '../../lib/formatNames';
import { useToast } from '../../components/toast/ToastContext';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import {
  Building2,
  Plus,
  DoorOpen,
  Users,
  MapPin,
  Trash2,
  Pencil,
  Copy,
  ExternalLink,
  Layers,
  History,
  TrendingUp,
  MoreVertical,
  CheckCircle2,
  LayoutGrid,
  List,
  Eye,
} from '../../components/icons';
import { RentIncreaseModal } from './RentIncreaseModal';
import { DestructiveConfirmationModal } from '../../components/ui/DestructiveConfirmationModal';

export const PropertiesView: React.FC = () => {
  const pack = usePack();
  const { showToast } = useToast();

  const [properties, setProperties] = useState<Property[]>(() =>
    db.getTable<Property>('properties').filter((p) => !p.deleted_at && !(p as any).deletedAt)
  );
  const [units, setUnits] = useState<Unit[]>(() =>
    db.getTable<Unit>('units').filter((u) => !u.deleted_at && !(u as any).deletedAt)
  );
  const [leases, setLeases] = useState<Lease[]>(() =>
    db.getTable<Lease>('leases').filter((l) => !l.deleted_at && !(l as any).deletedAt)
  );
  const [tenants, setTenants] = useState<Tenant[]>(() =>
    db.getTable<Tenant>('tenants').filter((t) => !t.deleted_at && !(t as any).deletedAt)
  );
  const [credits, setCredits] = useState<Credit[]>(() =>
    db.getTable<Credit>('credits').filter((c) => !c.deleted_at && !(c as any).deletedAt && c.status === 'active')
  );
  const [selectedPropId, setSelectedPropId] = useState<string | null>(properties[0]?.id || null);
  const [unitViewMode, setUnitViewMode] = useState<'grid' | 'list'>('grid');

  // Property Modals
  const [isAddPropOpen, setIsAddPropOpen] = useState(false);
  const [editingProp, setEditingProp] = useState<Property | null>(null);
  const [deletingProp, setDeletingProp] = useState<Property | null>(null);

  React.useEffect(() => {
    const handler = () => setIsAddPropOpen(true);
    window.addEventListener('rentflow_open_new_property', handler);
    return () => window.removeEventListener('rentflow_open_new_property', handler);
  }, []);

  // Unit Modals
  const [isAddUnitOpen, setIsAddUnitOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const [selectedUnitDetail, setSelectedUnitDetail] = useState<Unit | null>(null);
  const [rentHistoryUnit, setRentHistoryUnit] = useState<Unit | null>(null);

  // Form states - Property
  const [propName, setPropName] = useState('');
  const [propAddress, setPropAddress] = useState('');
  const [propCity, setPropCity] = useState('');
  const [propType, setPropType] = useState<any>('residential_apartment');
  const [propNotes, setPropNotes] = useState('');
  const [propLat, setPropLat] = useState('');
  const [propLng, setPropLng] = useState('');
  const [isGeocoding, setIsGeocoding] = useState(false);

  // Form states - Unit
  const [unitName, setUnitName] = useState('');
  const [unitRent, setUnitRent] = useState('1850');
  const [unitSize, setUnitSize] = useState('850');
  const [unitBeds, setUnitBeds] = useState('2');
  const [unitBaths, setUnitBaths] = useState('1');
  const [unitStatus, setUnitStatus] = useState<'vacant' | 'occupied' | 'maintenance'>('vacant');

  const handleOpenEditProp = (p: Property) => {
    setEditingProp(p);
    setPropName(p.name);
    setPropAddress(p.address_line1 || p.address || '');
    setPropCity(p.city || 'Default City');
    setPropType(p.type);
    setPropNotes(p.notes || '');
    setPropLat(p.latitude ? String(p.latitude) : p.lat ? String(p.lat) : '');
    setPropLng(p.longitude ? String(p.longitude) : p.lng ? String(p.lng) : '');
  };

  const handleManualGeocode = async () => {
    if (!propAddress.trim() && !propCity.trim()) {
      showToast({ type: 'info', message: 'Please enter street address or city to locate on map.' });
      return;
    }
    setIsGeocoding(true);
    try {
      const coords = await geocodeAddress(propAddress.trim(), propCity.trim(), pack.code);
      if (coords) {
        setPropLat(coords.lat.toFixed(5));
        setPropLng(coords.lng.toFixed(5));
        showToast({ type: 'success', message: `Found coordinates: ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}` });
      } else {
        showToast({ type: 'error', message: 'Could not resolve coordinates for this address.' });
      }
    } catch {
      showToast({ type: 'error', message: 'Geocoding failed. Please check network connection.' });
    } finally {
      setIsGeocoding(false);
    }
  };

  const handleSaveProperty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!propName.trim()) {
      showToast({ type: 'error', message: 'Property name is required!' });
      return;
    }
    if (!propAddress.trim()) {
      showToast({ type: 'error', message: 'Property address is required!' });
      return;
    }

    let latVal: number | null = null;
    let lngVal: number | null = null;
    if (propLat && propLng) {
      const coords = sanitizeCoordinates(propLat, propLng);
      if (coords) {
        latVal = coords.lat;
        lngVal = coords.lng;
      }
    } else if (propLat) {
      const parsedLat = parseFloat(propLat);
      if (!isNaN(parsedLat) && parsedLat >= -90 && parsedLat <= 90) latVal = parsedLat;
    } else if (propLng) {
      const parsedLng = parseFloat(propLng);
      if (!isNaN(parsedLng) && parsedLng >= -180 && parsedLng <= 180) lngVal = parsedLng;
    }

    // Auto-geocode via OpenStreetMap Nominatim if coordinates were left blank
    if (latVal === null || lngVal === null) {
      setIsGeocoding(true);
      try {
        const autoCoords = await geocodeAddress(propAddress.trim(), propCity.trim(), pack.code);
        if (autoCoords) {
          latVal = autoCoords.lat;
          lngVal = autoCoords.lng;
        }
      } catch (err) {
        console.warn('Auto-geocoding property failed:', err);
      } finally {
        setIsGeocoding(false);
      }
    }

    if (editingProp) {
      db.updateItem<Property>('properties', editingProp.id, {
        name: propName.trim(),
        address_line1: propAddress.trim(),
        address: propAddress.trim(),
        city: propCity || 'Default City',
        type: propType,
        notes: propNotes,
        latitude: latVal,
        longitude: lngVal,
        lat: latVal,
        lng: lngVal,
      });
      db.notifyWrite();
      showToast({ type: 'success', message: `Property "${propName}" updated` });
      setEditingProp(null);
    } else {
      const created = db.insertItem<Property>('properties', {
        id: generateUUID(),
        org_id: 'org_demo_1',
        name: propName.trim(),
        address_line1: propAddress.trim(),
        address: propAddress.trim(),
        city: propCity || 'Default City',
        country_code: pack.code,
        type: propType,
        notes: propNotes,
        latitude: latVal,
        longitude: lngVal,
        lat: latVal,
        lng: lngVal,
      });
      db.notifyWrite();
      showToast({ type: 'success', message: `Property "${created.name}" created and placed on map` });
      setIsAddPropOpen(false);
      setSelectedPropId(created.id);
    }

    setProperties(db.getTable<Property>('properties').filter((p) => !p.deleted_at && !(p as any).deletedAt));
    setPropName('');
    setPropAddress('');
    setPropCity('');
    setPropNotes('');
    setPropLat('');
    setPropLng('');
  };

  // Listen to DB mutations
  React.useEffect(() => {
    const unsub = db.onWrite(() => {
      setProperties(db.getTable<Property>('properties').filter((p) => !p.deleted_at && !(p as any).deletedAt));
      setUnits(db.getTable<Unit>('units').filter((u) => !u.deleted_at && !(u as any).deletedAt));
      setLeases(db.getTable<Lease>('leases').filter((l) => !l.deleted_at && !(l as any).deletedAt));
      setTenants(db.getTable<Tenant>('tenants').filter((t) => !t.deleted_at && !(t as any).deletedAt));
      setCredits(
        db.getTable<Credit>('credits').filter((c) => !c.deleted_at && !(c as any).deletedAt && c.status === 'active')
      );
    });
    return unsub;
  }, []);

  const handleConfirmDeleteProp = () => {
    if (!deletingProp) return;
    const success = db.deletePropertyCascading(deletingProp.id);
    if (success) {
      const remainingProps = db.getTable<Property>('properties').filter((p) => !p.deleted_at && !(p as any).deletedAt);
      setProperties(remainingProps);
      setUnits(db.getTable<Unit>('units').filter((u) => !u.deleted_at && !(u as any).deletedAt));
      if (selectedPropId === deletingProp.id) {
        setSelectedPropId(remainingProps[0]?.id || null);
      }
      showToast({
        type: 'info',
        message: `Property "${deletingProp.name}" and associated units archived`,
      });
    }
    setDeletingProp(null);
  };

  const handleOpenEditUnit = (u: Unit) => {
    setEditingUnit(u);
    setUnitName(getUnitDisplayName(u) === 'Unnamed Unit' ? '' : getUnitDisplayName(u));
    setUnitRent(String(minorToMajorNumber(u.rent_minor, u.currency_code || pack)));
    setUnitSize(String(u.size));
    setUnitBeds(String(u.bedrooms));
    setUnitBaths(String(u.bathrooms));
    setUnitStatus(u.status);
  };

  const handleSaveUnit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!unitName.trim()) {
      showToast({ type: 'error', message: 'Unit name / number is required!' });
      return;
    }
    if (!selectedPropId) {
      showToast({ type: 'error', message: 'Please select a parent property!' });
      return;
    }

    const rentMinor = parseMajorToMinor(unitRent, pack);
    const sizeVal = parseInt(unitSize) || 800;
    const bedsVal = parseInt(unitBeds) || 1;
    const bathsVal = parseFloat(unitBaths) || 1;

    if (editingUnit) {
      if (editingUnit.rent_minor !== rentMinor) {
        db.insertItem<RentIncrease>('rent_increases', {
          id: generateUUID(),
          unit_id: editingUnit.id,
          old_amount_minor: editingUnit.rent_minor,
          new_amount_minor: rentMinor,
          effective_date: new Date().toISOString().split('T')[0],
          reason: 'Periodic Rent Review',
          user_id: 'local_user',
          created_at: Date.now(),
        });
      }

      db.updateItem<Unit>('units', editingUnit.id, {
        name: unitName.trim(),
        rent_minor: rentMinor,
        size: sizeVal,
        bedrooms: bedsVal,
        bathrooms: bathsVal,
        status: unitStatus,
      });
      showToast({ type: 'success', message: `Unit "${unitName}" updated` });
      setEditingUnit(null);
    } else {
      const created = db.insertItem<Unit>('units', {
        id: generateUUID(),
        property_id: selectedPropId,
        name: unitName.trim(),
        size: sizeVal,
        area_unit: pack.areaUnit,
        bedrooms: bedsVal,
        bathrooms: bathsVal,
        rent_minor: rentMinor,
        currency_code: pack.currency.code,
        status: unitStatus,
      });
      showToast({ type: 'success', message: `Unit "${created.name}" created` });
      setIsAddUnitOpen(false);
    }

    setUnits(db.getTable<Unit>('units').filter((u) => !u.deleted_at && !(u as any).deletedAt));
    setUnitName('');
  };

  const handleDeleteUnit = (u: Unit) => {
    const success = db.deleteUnitCascading(u.id);
    if (success) {
      setUnits(db.getTable<Unit>('units').filter((item) => !item.deleted_at && !(item as any).deletedAt));
      showToast({
        type: 'info',
        message: `Unit "${u.name}" archived`,
      });
    }
  };

  const activeLeaseUnitIds = new Set(
    leases.filter((l) => l.status === 'active' && !l.deleted_at && !(l as any).deletedAt).map((l) => l.unit_id)
  );
  const isUnitOccupied = (u: Unit) => u.status === 'occupied' || activeLeaseUnitIds.has(u.id);

  const activeProp = properties.find((p) => p.id === selectedPropId);
  const propUnits = activeProp ? units.filter((u) => u.property_id === activeProp.id) : [];
  const occupiedCount = propUnits.filter(isUnitOccupied).length;
  const occupancyPct = propUnits.length > 0 ? Math.round((occupiedCount / propUnits.length) * 100) : 0;
  const totalRentMinor = propUnits.reduce((acc, u) => acc + (isUnitOccupied(u) ? u.rent_minor : 0), 0);

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Properties & Rental Units
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Real estate portfolio &bull; Unit inventory &bull; Floor areas in {pack.areaUnit} ({pack.name})
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => {
              setUnitName('');
              setUnitRent('1850');
              setIsAddUnitOpen(true);
            }}
            disabled={!selectedPropId}
            className="gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Add Unit</span>
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              setPropName('');
              setPropAddress('');
              setIsAddPropOpen(true);
            }}
            className="gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Add Property</span>
          </Button>
        </div>
      </div>

      {/* Main Two-Pane Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Properties Directory List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">
              Properties ({properties.length})
            </h2>
            <Badge variant="neutral">{pack.code} Standards</Badge>
          </div>

          <div className="space-y-3">
            {properties.length === 0 ? (
              <div className="p-8 text-center rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-surface)] space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-[var(--accent-subtle)] text-[var(--accent)] flex items-center justify-center mx-auto">
                  <Building2 className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-[var(--text-primary)]">No Properties Registered</h4>
                <p className="text-xs text-[var(--text-secondary)] max-w-xs mx-auto leading-relaxed">
                  Add your first building, multi-family complex, or commercial rental to start managing units and leases.
                </p>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setPropName('');
                    setPropAddress('');
                    setIsAddPropOpen(true);
                  }}
                  className="gap-2 mx-auto"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ Add Property</span>
                </Button>
              </div>
            ) : (
              properties.map((p) => {
                const isSelected = p.id === selectedPropId;
                const count = units.filter((u) => u.property_id === p.id).length;
                const propOccupied = units.filter((u) => u.property_id === p.id && isUnitOccupied(u)).length;
                const occRate = count > 0 ? Math.round((propOccupied / count) * 100) : 0;

                return (
                  <div
                    key={p.id}
                    onClick={() => setSelectedPropId(p.id)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'border-[var(--accent)] bg-[var(--bg-surface)] card-shadow ring-1 ring-[var(--accent)]/30'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div className="w-10 h-10 rounded-xl bg-[var(--accent-subtle)] text-[var(--accent)] flex items-center justify-center shrink-0">
                          <Building2 className="w-5 h-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm font-bold text-[var(--text-primary)] truncate">{p.name}</h3>
                          <p className="text-xs text-[var(--text-secondary)] flex items-center gap-1 mt-0.5 line-clamp-1">
                            <MapPin className="w-3 h-3 text-[var(--text-subtle)] shrink-0" />
                            <span className="truncate">{p.address_line1 || p.address || 'No address set'}</span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenEditProp(p);
                          }}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--bg-base)] cursor-pointer"
                          title="Edit Property"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletingProp(p);
                          }}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--status-danger-fg)] hover:bg-[var(--bg-base)] cursor-pointer"
                          title="Archive Property"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Property Quick Metrics */}
                    <div className="flex items-center justify-between pt-3 mt-3 border-t border-[var(--border-subtle)] text-xs text-[var(--text-secondary)]">
                      <span className="font-medium">{count} Units</span>
                      <Badge variant={occRate >= 80 ? 'success' : occRate > 0 ? 'warning' : 'neutral'}>
                        {occRate}% Occupied
                      </Badge>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right 2 Columns: Selected Property Details & Units Floorplan */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="space-y-6">
            <CardHeader className="border-b border-[var(--border-subtle)] pb-4 mb-0">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0">
                  <CardTitle className="text-lg truncate">{activeProp ? activeProp.name : 'Select a Property'}</CardTitle>
                  {activeProp && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleOpenEditProp(activeProp)}
                      className="h-7 text-xs px-2 gap-1 rounded-lg shrink-0"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </Button>
                  )}
                </div>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate">
                  {activeProp?.address_line1 || activeProp?.address} &bull; {activeProp?.city || 'Default Region'}
                </p>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <div className="flex items-center p-1 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)]">
                  <button
                    type="button"
                    onClick={() => setUnitViewMode('grid')}
                    className={`p-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                      unitViewMode === 'grid'
                        ? 'bg-[var(--bg-surface)] text-[var(--accent)] font-semibold shadow-xs'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                    title="Grid View"
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setUnitViewMode('list')}
                    className={`p-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                      unitViewMode === 'list'
                        ? 'bg-[var(--bg-surface)] text-[var(--accent)] font-semibold shadow-xs'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                    title="List View"
                  >
                    <List className="w-4 h-4" />
                  </button>
                </div>

                <div className="text-right">
                  <span className="text-[10px] text-[var(--text-subtle)] font-bold uppercase tracking-wider block">
                    Occupancy Rate
                  </span>
                  <span className="text-base font-bold font-mono text-[var(--accent)]">
                    {occupancyPct}% ({occupiedCount}/{propUnits.length})
                  </span>
                </div>
              </div>
            </CardHeader>

            {/* Units Grid / List Views */}
            {propUnits.length === 0 ? (
              <div className="text-center py-16 text-xs text-[var(--text-secondary)]">
                No units added to this property yet. Click "Add Unit" to create one.
              </div>
            ) : unitViewMode === 'list' ? (
              <div className="overflow-x-auto rounded-2xl border border-[var(--border-subtle)]">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-base)] text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                      <th className="py-3 px-4">Unit Name / Number</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Resident</th>
                      <th className="py-3 px-4 text-right">Monthly Rent</th>
                      <th className="py-3 px-4">Specs</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)] text-sm bg-[var(--bg-surface)]">
                    {propUnits.map((u) => {
                      const unitDisplay = getUnitDisplayName(u);
                      const unitOccupied = isUnitOccupied(u);
                      const displayStatus = unitOccupied ? 'occupied' : u.status;
                      const statusVariant =
                        displayStatus === 'occupied' ? 'success' : displayStatus === 'vacant' ? 'warning' : 'danger';
                      const activeLease = leases.find((l) => l.unit_id === u.id && l.status === 'active');
                      const resident = activeLease ? tenants.find((t) => t.id === activeLease.tenant_id) : null;

                      return (
                        <tr
                          key={u.id}
                          onClick={() => setSelectedUnitDetail(u)}
                          className="hover:bg-[var(--bg-base)] transition-colors cursor-pointer"
                        >
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-lg bg-[var(--accent-subtle)] text-[var(--accent)] flex items-center justify-center shrink-0">
                                <DoorOpen className="w-4 h-4" />
                              </div>
                              <span className="font-bold text-sm text-[var(--text-primary)] whitespace-nowrap">
                                {unitDisplay}
                              </span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <Badge variant={statusVariant}>{displayStatus.toUpperCase()}</Badge>
                          </td>
                          <td className="py-3.5 px-4 text-xs text-[var(--text-secondary)] whitespace-nowrap">
                            {resident ? resident.name : <span className="text-[var(--text-subtle)]">Vacant</span>}
                          </td>
                          <td className="py-3.5 px-4 text-right font-bold font-mono number-tabular text-[var(--text-primary)] whitespace-nowrap">
                            {formatMoney(u.rent_minor, pack)}
                          </td>
                          <td className="py-3.5 px-4 text-xs text-[var(--text-secondary)] whitespace-nowrap">
                            {u.bedrooms} Bed &bull; {u.bathrooms} Bath &bull; {u.size} {u.area_unit}
                          </td>
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => setSelectedUnitDetail(u)}
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--bg-base)] cursor-pointer"
                                title="View Unit Details"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setRentHistoryUnit(u)}
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--bg-base)] cursor-pointer"
                                title="Rent Increase History & Notice Compliance"
                              >
                                <TrendingUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleOpenEditUnit(u)}
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--bg-base)] cursor-pointer"
                                title="Edit Unit"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteUnit(u)}
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--status-danger-fg)] hover:bg-[var(--bg-base)] cursor-pointer"
                                title="Archive Unit"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {propUnits.map((u) => {
                  const unitDisplay = getUnitDisplayName(u);
                  const unitOccupied = isUnitOccupied(u);
                  const displayStatus = unitOccupied ? 'occupied' : u.status;
                  const statusVariant =
                    displayStatus === 'occupied' ? 'success' : displayStatus === 'vacant' ? 'warning' : 'danger';
                  const activeLease = leases.find((l) => l.unit_id === u.id && l.status === 'active');
                  const resident = activeLease ? tenants.find((t) => t.id === activeLease.tenant_id) : null;

                  return (
                    <div
                      key={u.id}
                      onClick={() => setSelectedUnitDetail(u)}
                      className="p-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-base)] space-y-3 group hover:border-[var(--accent)]/50 transition-all cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className="w-8 h-8 rounded-lg bg-[var(--accent-subtle)] text-[var(--accent)] flex items-center justify-center shrink-0">
                            <DoorOpen className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h4 className="font-bold text-base text-[var(--text-primary)] truncate">
                              {unitDisplay}
                            </h4>
                            {resident && (
                              <span className="text-[11px] text-[var(--text-secondary)] block truncate">
                                Resident: {resident.name}
                              </span>
                            )}
                          </div>
                        </div>
                        <Badge variant={statusVariant} className="shrink-0">
                          {displayStatus.toUpperCase()}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-xs text-[var(--text-secondary)] border-t border-[var(--border-subtle)] pt-3">
                        <div>
                          <span className="block text-[10px] text-[var(--text-subtle)] uppercase tracking-wider font-semibold">
                            Monthly Rent
                          </span>
                          <span className="font-bold number-tabular text-[var(--text-primary)] text-sm">
                            {formatMoney(u.rent_minor, pack)}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[10px] text-[var(--text-subtle)] uppercase tracking-wider font-semibold">
                            Floor Specs
                          </span>
                          <span>
                            {u.bedrooms} Bed &bull; {u.bathrooms} Bath &bull; {u.size} {u.area_unit}
                          </span>
                        </div>
                      </div>

                      <div
                        className="flex items-center justify-end gap-1.5 pt-2 border-t border-[var(--border-subtle)]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => setSelectedUnitDetail(u)}
                          className="h-7 px-2 rounded-lg flex items-center gap-1 text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--bg-surface)] cursor-pointer"
                          title="View Unit Details"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Details</span>
                        </button>
                        <button
                          onClick={() => setRentHistoryUnit(u)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--bg-surface)] cursor-pointer"
                          title="Rent Increase History & Notice Compliance"
                        >
                          <TrendingUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleOpenEditUnit(u)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--bg-surface)] cursor-pointer"
                          title="Edit Unit"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteUnit(u)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--status-danger-fg)] hover:bg-[var(--bg-surface)] cursor-pointer"
                          title="Archive Unit"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Property Modal */}
      <Modal
        isOpen={isAddPropOpen || !!editingProp}
        onClose={() => {
          setIsAddPropOpen(false);
          setEditingProp(null);
        }}
        title={editingProp ? `Edit Property: ${editingProp.name}` : 'Add New Property'}
        description="Add a physical asset or building to your portfolio directory."
        maxWidth="xl"
      >
        <form onSubmit={handleSaveProperty} className="space-y-4">
          <Input
            label="Property Name *"
            value={propName}
            onChange={(e) => setPropName(e.target.value)}
            placeholder="e.g. Oak Ridge Executive Apartments"
            required
          />

          <Input
            label="Street Address Line 1 *"
            value={propAddress}
            onChange={(e) => setPropAddress(e.target.value)}
            placeholder="Full street address"
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="City / Town"
              value={propCity}
              onChange={(e) => setPropCity(e.target.value)}
              placeholder="e.g. Springfield"
            />
            <Select
              label="Property Type"
              value={propType}
              onChange={(e) => setPropType(e.target.value)}
            >
              <option value="residential_apartment">Residential Apartment</option>
              <option value="single_family">Single Family Home</option>
              <option value="commercial">Commercial / Retail</option>
              <option value="mixed_use">Mixed Use</option>
              <option value="land">Vacant Land</option>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--text-secondary)]">
                Map Location & Coordinates
              </span>
              <button
                type="button"
                onClick={handleManualGeocode}
                disabled={isGeocoding}
                className="text-xs text-[var(--accent)] hover:underline flex items-center gap-1 font-medium cursor-pointer disabled:opacity-50"
              >
                <MapPin className="w-3.5 h-3.5" />
                <span>{isGeocoding ? 'Locating...' : 'Locate Address on Map'}</span>
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Latitude"
                type="number"
                step="any"
                value={propLat}
                onChange={(e) => setPropLat(e.target.value)}
                placeholder="Auto-detected if blank"
              />
              <Input
                label="Longitude"
                type="number"
                step="any"
                value={propLng}
                onChange={(e) => setPropLng(e.target.value)}
                placeholder="Auto-detected if blank"
              />
            </div>
            <p className="text-[11px] text-[var(--text-subtle)]">
              Coordinates will be automatically resolved via OpenStreetMap geocoding when you save.
            </p>
          </div>

          <Input
            label="Notes / Amenities Description"
            value={propNotes}
            onChange={(e) => setPropNotes(e.target.value)}
            placeholder="Access codes, parking regulations, notes"
          />

          <div className="flex justify-end gap-3 pt-3 border-t border-[var(--border-subtle)]">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsAddPropOpen(false);
                setEditingProp(null);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              {editingProp ? 'Update Property' : 'Create Property'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Unit Modal */}
      <Modal
        isOpen={isAddUnitOpen || !!editingUnit}
        onClose={() => {
          setIsAddUnitOpen(false);
          setEditingUnit(null);
        }}
        title={editingUnit ? `Edit Unit: ${editingUnit.name}` : 'Add Unit to Property'}
        description="Configure unit number, rent tier, and bedroom specifications."
        maxWidth="lg"
      >
        <form onSubmit={handleSaveUnit} className="space-y-4">
          <Input
            label="Unit Name / Number *"
            value={unitName}
            onChange={(e) => setUnitName(e.target.value)}
            placeholder="e.g. Apt 302"
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label={`Monthly Rent (${pack.currency.code}) *`}
              type="number"
              value={unitRent}
              onChange={(e) => setUnitRent(e.target.value)}
              required
            />
            <Input
              label={`Floor Area (${pack.areaUnit})`}
              type="number"
              value={unitSize}
              onChange={(e) => setUnitSize(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input
              label="Bedrooms"
              type="number"
              value={unitBeds}
              onChange={(e) => setUnitBeds(e.target.value)}
            />
            <Input
              label="Bathrooms"
              type="number"
              step="0.5"
              value={unitBaths}
              onChange={(e) => setUnitBaths(e.target.value)}
            />
            <Select
              label="Status"
              value={unitStatus}
              onChange={(e) => setUnitStatus(e.target.value as any)}
            >
              <option value="vacant">Vacant</option>
              <option value="occupied">Occupied</option>
              <option value="maintenance">Maintenance</option>
            </Select>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-[var(--border-subtle)]">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsAddUnitOpen(false);
                setEditingUnit(null);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              {editingUnit ? 'Save Unit Changes' : 'Create Unit'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Feature: Unit Detail View Modal */}
      {selectedUnitDetail && (() => {
        const unitDisplay = getUnitDisplayName(selectedUnitDetail);
        const parentProp = properties.find((p) => p.id === selectedUnitDetail.property_id);
        const unitOccupied = isUnitOccupied(selectedUnitDetail);
        const displayStatus = unitOccupied ? 'occupied' : selectedUnitDetail.status;
        const statusVariant =
          displayStatus === 'occupied' ? 'success' : displayStatus === 'vacant' ? 'warning' : 'danger';
        const activeLease = leases.find((l) => l.unit_id === selectedUnitDetail.id && l.status === 'active');
        const resident = activeLease ? tenants.find((t) => t.id === activeLease.tenant_id) : null;
        const unitCreditMinor = credits
          .filter(
            (c) =>
              (activeLease && (c.lease_id === activeLease.id || (c as any).leaseId === activeLease.id)) ||
              (resident && (c.tenant_id === resident.id || (c as any).tenantId === resident.id))
          )
          .reduce((sum, c) => sum + (c.amount_minor || 0), 0);

        return (
          <Modal
            isOpen={!!selectedUnitDetail}
            onClose={() => setSelectedUnitDetail(null)}
            title={`Unit Details: ${unitDisplay}`}
            description={parentProp ? `${parentProp.name} • ${parentProp.address_line1 || parentProp.address || ''}` : 'Rental Unit Profile'}
            maxWidth="lg"
          >
            <div className="space-y-5">
              <div className="p-4 rounded-2xl bg-[var(--bg-base)] border border-[var(--border-subtle)] flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-2xl bg-[var(--accent-subtle)] text-[var(--accent)] flex items-center justify-center shrink-0">
                    <DoorOpen className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-xl font-bold text-[var(--text-primary)] truncate">
                      {unitDisplay}
                    </h3>
                    <p className="text-xs text-[var(--text-secondary)] truncate">
                      {parentProp?.name || 'Property Unit'}
                    </p>
                  </div>
                </div>
                <Badge variant={statusVariant} className="shrink-0">
                  {displayStatus.toUpperCase()}
                </Badge>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)]">
                  <span className="text-[10px] font-bold text-[var(--text-subtle)] uppercase block">Monthly Rent</span>
                  <span className="text-sm font-bold font-mono text-[var(--text-primary)] mt-0.5 block">
                    {formatMoney(selectedUnitDetail.rent_minor, pack)}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)]">
                  <span className="text-[10px] font-bold text-[var(--text-subtle)] uppercase block">Bedrooms</span>
                  <span className="text-sm font-bold text-[var(--text-primary)] mt-0.5 block">
                    {selectedUnitDetail.bedrooms} Bed
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)]">
                  <span className="text-[10px] font-bold text-[var(--text-subtle)] uppercase block">Bathrooms</span>
                  <span className="text-sm font-bold text-[var(--text-primary)] mt-0.5 block">
                    {selectedUnitDetail.bathrooms} Bath
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)]">
                  <span className="text-[10px] font-bold text-[var(--text-subtle)] uppercase block">Floor Size</span>
                  <span className="text-sm font-bold text-[var(--text-primary)] mt-0.5 block">
                    {selectedUnitDetail.size} {selectedUnitDetail.area_unit}
                  </span>
                </div>
              </div>

              {activeLease && resident ? (
                <div className="p-4 rounded-2xl bg-[var(--bg-base)] border border-[var(--border-subtle)] space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold uppercase tracking-wider text-[10px] text-[var(--text-subtle)]">
                      Current Resident & Lease
                    </span>
                    {unitCreditMinor > 0 && (
                      <Badge variant="success" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 font-bold font-mono text-[11px]">
                        Credit Balance: {formatMoney(unitCreditMinor, pack)}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <span className="text-sm font-bold text-[var(--text-primary)] block">{resident.name}</span>
                      <span className="text-xs text-[var(--text-secondary)] font-mono">{resident.phone}</span>
                    </div>
                    <div className="text-right font-mono text-[var(--text-secondary)]">
                      <div>{activeLease.start_date} &rarr; {activeLease.end_date}</div>
                      <div>Due Day: {activeLease.due_day}</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-[var(--bg-base)] border border-dashed border-[var(--border-strong)] text-xs text-[var(--text-secondary)] text-center">
                  This unit is currently {displayStatus} with no active lease assigned.
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-[var(--border-subtle)]">
                <Button variant="outline" size="sm" onClick={() => setSelectedUnitDetail(null)}>
                  Close
                </Button>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const target = selectedUnitDetail;
                      setSelectedUnitDetail(null);
                      setRentHistoryUnit(target);
                    }}
                    className="gap-1.5"
                  >
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span>Rent History</span>
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      const target = selectedUnitDetail;
                      setSelectedUnitDetail(null);
                      handleOpenEditUnit(target);
                    }}
                    className="gap-1.5"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>Edit Unit</span>
                  </Button>
                </div>
              </div>
            </div>
          </Modal>
        );
      })()}

      {/* Feature: Unit Rent Increase History & Notice Period Validation */}
      <RentIncreaseModal
        isOpen={!!rentHistoryUnit}
        onClose={() => setRentHistoryUnit(null)}
        unit={rentHistoryUnit}
        property={properties.find((p) => p.id === rentHistoryUnit?.property_id) || null}
        onUpdate={() => setUnits(db.getTable<Unit>('units').filter((u) => !u.deleted_at && !(u as any).deletedAt))}
      />

      {/* Feature: High-Security Destructive Action Confirmation */}
      <DestructiveConfirmationModal
        isOpen={!!deletingProp}
        onClose={() => setDeletingProp(null)}
        onConfirm={handleConfirmDeleteProp}
        title="Archive Property & Associated Units"
        itemName={deletingProp?.name || ''}
        itemType="Property"
        warningDetails="This will cascade and soft-delete all rental units, active leases, invoices, and payment records associated with this property."
      />
    </div>
  );
};
