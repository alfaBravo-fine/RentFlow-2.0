import React, { useState } from 'react';
import { db } from '../../db/client';
import { Property, Unit, Tenant, Lease } from '../../db/schema';
import { usePack } from '../../countries/usePack';
import { formatMoney, parseMajorToMinor } from '../../lib/money';
import { calculateUtilitySplits, applyUtilitySplit } from '../../lib/utilitySplitter';
import { useToast } from '../../components/toast/ToastContext';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Input';
import {
  Calculator,
  Receipt,
  CheckCircle2,
} from '../../components/icons';

export const UtilitySplitterView: React.FC = () => {
  const pack = usePack();
  const { showToast } = useToast();

  const properties = db.getTable<Property>('properties').filter((p) => !p.deleted_at && !(p as any).deletedAt);
  const activePropertyIds = new Set(properties.map((p) => p.id));
  const units = db
    .getTable<Unit>('units')
    .filter((u) => !u.deleted_at && !(u as any).deletedAt && activePropertyIds.has(u.property_id));
  const tenants = db.getTable<Tenant>('tenants').filter((t) => !t.deleted_at && !(t as any).deletedAt);
  const leases = db.getTable<Lease>('leases').filter((l) => !l.deleted_at && !(l as any).deletedAt);

  const [selectedPropId, setSelectedPropId] = useState(properties[0]?.id || '');
  const [utilityType, setUtilityType] = useState<'electricity' | 'water' | 'gas' | 'trash' | 'internet'>('electricity');
  const [totalBillAmount, setTotalBillAmount] = useState('350');
  const [splitMethod, setSplitMethod] = useState<'by_sqft' | 'equal_headcount'>('by_sqft');
  const [hasCalculated, setHasCalculated] = useState(false);

  const propUnits = units.filter((u) => u.property_id === selectedPropId);
  const occupiedUnits = propUnits.filter((u) => {
    const l = leases.find((lease) => lease.unit_id === u.id && lease.status === 'active');
    return u.status === 'occupied' || !!l;
  });

  const totalBillMinor = parseMajorToMinor(totalBillAmount, pack);

  // Compute exact largest-remainder per-unit split with zero rounding drift
  const unitSplits = calculateUtilitySplits({
    units: propUnits,
    leases,
    tenants,
    totalBillMinor,
    splitMethod,
  });

  const handleCalculateSplit = () => {
    if (totalBillMinor <= 0) {
      showToast({ type: 'error', message: 'Enter a valid utility bill amount!' });
      return;
    }

    if (propUnits.length === 0) {
      showToast({ type: 'error', message: 'No units found for this property.' });
      return;
    }

    setHasCalculated(true);
    showToast({
      type: 'info',
      message: `Utility split calculated across ${occupiedUnits.length} occupied unit(s).`,
    });
  };

  const applySplitToInvoices = () => {
    if (totalBillMinor <= 0) {
      showToast({ type: 'error', message: 'Enter a valid utility bill amount!' });
      return;
    }

    try {
      const result = applyUtilitySplit({
        propertyId: selectedPropId,
        utilityType,
        totalBillMinor,
        splitMethod,
        currencyCode: pack.currency.code,
        dbClient: db,
      });

      if (result.alreadyApplied) {
        showToast({
          type: 'info',
          message: `${utilityType.toUpperCase()} utility bill for ${result.billPeriod} has already been applied to this property's invoices.`,
        });
        setHasCalculated(false);
        return;
      }

      if (result.skippedVacantUnits.length > 0 && result.appliedCount === 0) {
        showToast({
          type: 'error',
          message: `Cannot apply utility charges: all ${result.skippedVacantUnits.length} unit(s) are vacant or lack an active lease.`,
        });
        return;
      }

      if (result.appliedCount > 0) {
        setHasCalculated(false);
        showToast({
          type: 'success',
          message: `Utility bills added to ${result.appliedCount} invoice(s) successfully!`,
        });
      }
    } catch (err: any) {
      showToast({
        type: 'error',
        message: err?.message || 'Failed to apply utility split to invoices.',
      });
    }
  };

  const handleApplyAsInvoiceLineItems = () => {
    applySplitToInvoices();
  };

  const selectedProp = properties.find((p) => p.id === selectedPropId);

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Utility Bill Sub-Metering Splitter
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Automated apportionment for electric, water, gas, and broadband across occupied units ({pack.name})
          </p>
        </div>
        <Badge variant="accent">Sub-Metering Tool</Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Configuration Controls */}
        <Card className="space-y-5">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-[var(--accent-subtle)] text-[var(--accent)] flex items-center justify-center shrink-0">
                <Calculator className="w-4 h-4" />
              </div>
              <CardTitle>Bill Configuration</CardTitle>
            </div>
          </CardHeader>

          <div className="space-y-4">
            <Select
              label="Select Property *"
              value={selectedPropId}
              onChange={(e) => setSelectedPropId(e.target.value)}
            >
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>

            <Select
              label="Utility Type *"
              value={utilityType}
              onChange={(e) => setUtilityType(e.target.value as any)}
            >
              <option value="electricity">Electricity</option>
              <option value="water">Water & Sewer</option>
              <option value="gas">Natural Gas / Heating</option>
              <option value="trash">Trash Collection</option>
              <option value="internet">Shared Broadband / Wi-Fi</option>
            </Select>

            <Input
              label={`Total Master Bill Amount (${pack.currency.code}) *`}
              type="number"
              value={totalBillAmount}
              onChange={(e) => {
                setTotalBillAmount(e.target.value);
                setHasCalculated(false);
              }}
              required
            />

            <Select
              label="Apportionment Method *"
              value={splitMethod}
              onChange={(e) => {
                setSplitMethod(e.target.value as any);
                setHasCalculated(false);
              }}
            >
              <option value="by_sqft">Proportional by Unit Size ({pack.areaUnit.toUpperCase()})</option>
              <option value="equal_headcount">Equal Split Per Occupied Unit</option>
            </Select>

            <div className="pt-2">
              <Button
                variant="primary"
                onClick={handleCalculateSplit}
                className="w-full gap-2 justify-center py-2.5"
              >
                <Calculator className="w-4 h-4" />
                <span>Calculate Split</span>
              </Button>
            </div>
          </div>
        </Card>

        {/* Right 2 Columns: Breakdown & Invoice Injection */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="space-y-5">
            <CardHeader className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <CardTitle>Tenant Utility Apportionment Breakdown</CardTitle>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  Property: <strong>{selectedProp?.name || 'Selected'}</strong> &bull; Total:{' '}
                  <strong className="text-[var(--text-primary)] font-mono">{formatMoney(totalBillMinor, pack)}</strong>
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant="accent">{occupiedUnits.length} Occupied Units</Badge>
                {hasCalculated && (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={handleApplyAsInvoiceLineItems}
                    className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <Receipt className="w-3.5 h-3.5" />
                    <span>Apply as Invoice Line Items</span>
                  </Button>
                )}
              </div>
            </CardHeader>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-base)] text-[var(--text-secondary)] font-semibold uppercase tracking-wider">
                    <th className="py-3 px-4">Unit & Resident</th>
                    <th className="py-3 px-4">Unit Size</th>
                    <th className="py-3 px-4 text-center">Share %</th>
                    <th className="py-3 px-4 text-right">Apportioned Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)] text-sm">
                  {unitSplits.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-10 text-center text-xs text-[var(--text-secondary)]">
                        No occupied units in this property available for utility apportionment.
                      </td>
                    </tr>
                  ) : (
                    unitSplits.map((item) => (
                      <tr key={item.unit.id} className="h-14 hover:bg-[var(--bg-base)] transition-colors">
                        <td className="py-3 px-4 min-w-0">
                          <p className="font-semibold text-[var(--text-primary)] truncate">{item.unit.name}</p>
                          <p className="text-xs text-[var(--text-secondary)] truncate">{item.tenant?.name || 'Vacant'}</p>
                        </td>
                        <td className="py-3 px-4 text-xs text-[var(--text-secondary)] font-mono">
                          {item.unit.size} {item.unit.area_unit}
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-bold text-[var(--accent)]">
                          {item.percentage}%
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold number-tabular text-[var(--text-primary)]">
                          {formatMoney(item.shareMinor, pack)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {hasCalculated && (
              <div className="p-4 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)] flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    Ready to append to tenant monthly statements. Click <strong>Apply as Invoice Line Items</strong> to update open invoices.
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={handleApplyAsInvoiceLineItems}
                  className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
                >
                  <Receipt className="w-3.5 h-3.5" />
                  <span>Apply Now</span>
                </Button>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};
