import React, { useState } from 'react';
import { db } from '../../db/client';
import { Unit, Property, RentIncrease } from '../../db/schema';
import { usePack } from '../../countries/usePack';
import { formatMoney } from '../../lib/money';
import { generateUUID } from '../../lib/uuid';
import { useToast } from '../../components/toast/ToastContext';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import {
  TrendingUp,
  History,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Clock,
  ArrowUpDown,
  Plus,
} from '../../components/icons';

interface RentIncreaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  unit: Unit | null;
  property: Property | null;
  onUpdate?: () => void;
}

export const RentIncreaseModal: React.FC<RentIncreaseModalProps> = ({
  isOpen,
  onClose,
  unit,
  property,
  onUpdate,
}) => {
  const pack = usePack();
  const { showToast } = useToast();

  const minNoticeDays = pack.noticePeriods.rentIncreaseDays;

  // Calculate default effective date = today + minNoticeDays
  const getDefaultDate = () => {
    const d = new Date();
    d.setDate(d.getDate() + minNoticeDays);
    return d.toISOString().split('T')[0];
  };

  const [increases, setIncreases] = useState<RentIncrease[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newRentMajor, setNewRentMajor] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(getDefaultDate);
  const [reason, setReason] = useState('Annual Cost-of-Living Adjustment');

  React.useEffect(() => {
    if (unit) {
      const records = db
        .getTable<RentIncrease>('rent_increases')
        .filter((r) => r.unit_id === unit.id && !r.deleted_at)
        .sort((a, b) => new Date(b.effective_date).getTime() - new Date(a.effective_date).getTime());
      setIncreases(records);

      // Default next rent = current rent + 5%
      const currMajor = unit.rent_minor / Math.pow(10, pack.currency.minorUnits);
      const suggestedMajor = Math.round(currMajor * 1.05);
      setNewRentMajor(String(suggestedMajor));
      setEffectiveDate(getDefaultDate());
      setShowAddForm(false);
    }
  }, [unit, isOpen]);

  if (!unit || !isOpen) return null;

  // Notice Period Calculation
  const todayMs = new Date().setHours(0, 0, 0, 0);
  const effectiveMs = new Date(effectiveDate).getTime();
  const daysNotice = Math.ceil((effectiveMs - todayMs) / (1000 * 60 * 60 * 24));
  const isCompliant = daysNotice >= minNoticeDays;

  const currentMajor = unit.rent_minor / Math.pow(10, pack.currency.minorUnits);
  const targetMajor = parseFloat(newRentMajor) || 0;
  const newRentMinor = Math.round(targetMajor * Math.pow(10, pack.currency.minorUnits));
  const rentDiffMinor = newRentMinor - unit.rent_minor;
  const rentDiffPercent = unit.rent_minor > 0 ? ((rentDiffMinor / unit.rent_minor) * 100).toFixed(1) : '0';

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    if (!targetMajor || targetMajor <= 0) {
      showToast({ type: 'error', message: 'Please enter a valid new rent amount.' });
      return;
    }

    if (!effectiveDate) {
      showToast({ type: 'error', message: 'Effective date is required.' });
      return;
    }

    const newRecord: RentIncrease = {
      id: generateUUID(),
      unit_id: unit.id,
      old_amount_minor: unit.rent_minor,
      new_amount_minor: newRentMinor,
      effective_date: effectiveDate,
      reason: reason.trim() || 'Annual Market Adjustment',
      created_at: Date.now(),
      updated_at: Date.now(),
      device_id: 'client',
    };

    // Save record to rent_increases
    db.insertItem<RentIncrease>('rent_increases', newRecord);

    // Update the unit's base rent
    db.updateItem<Unit>('units', unit.id, {
      rent_minor: newRentMinor,
      updated_at: Date.now(),
    });

    // Update state
    setIncreases([newRecord, ...increases]);
    setShowAddForm(false);

    showToast({
      type: 'success',
      message: `Rent increase saved! Unit rent updated to ${formatMoney(newRentMinor, pack)}.`,
    });

    if (onUpdate) {
      onUpdate();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Rent Increase History: ${unit.name}`}
      description={`${property ? property.name : 'Property'} • Current baseline rent: ${formatMoney(unit.rent_minor, pack)} / month`}
      maxWidth="2xl"
    >
      <div className="space-y-6">
        {/* Country Pack Statutory Notice Notice Card */}
        <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)] flex items-start gap-3">
          <Clock className="w-5 h-5 text-[var(--accent)] shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <span className="font-bold text-[var(--text-primary)]">
              {pack.name} Statutory Notice Period: {minNoticeDays} Days
            </span>
            <p className="text-[var(--text-secondary)] leading-relaxed">
              Under {pack.code} rental regulations, landlords must issue formal written notice at least{' '}
              <strong className="text-[var(--text-primary)]">{minNoticeDays} days</strong> prior to a rent
              increase taking effect.
            </p>
          </div>
        </div>

        {/* Action Bar */}
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-2">
            <History className="w-4 h-4 text-[var(--text-subtle)]" />
            <span>Adjustment Timeline ({increases.length})</span>
          </h4>

          {!showAddForm && (
            <Button
              size="sm"
              variant="primary"
              onClick={() => setShowAddForm(true)}
              className="gap-1.5 h-8 text-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Record Rent Increase</span>
            </Button>
          )}
        </div>

        {/* Add Form */}
        {showAddForm && (
          <form
            onSubmit={handleSave}
            className="p-5 rounded-2xl border border-[var(--accent)] bg-[var(--bg-surface)] card-shadow space-y-4"
          >
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <span className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-[var(--accent)]" />
                <span>New Rent Revision</span>
              </span>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                Cancel
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Input
                  label={`New Monthly Rent (${pack.currency.symbol}) *`}
                  type="number"
                  step="any"
                  value={newRentMajor}
                  onChange={(e) => setNewRentMajor(e.target.value)}
                  placeholder={`e.g. ${currentMajor + 100}`}
                  required
                />
                <div className="text-[11px] text-[var(--text-secondary)] mt-1 flex items-center gap-1 font-mono">
                  <span>Current: {formatMoney(unit.rent_minor, pack)}</span>
                  {rentDiffMinor !== 0 && (
                    <span className={rentDiffMinor > 0 ? 'text-amber-600 font-bold' : 'text-emerald-600 font-bold'}>
                      ({rentDiffMinor > 0 ? '+' : ''}
                      {rentDiffPercent}%)
                    </span>
                  )}
                </div>
              </div>

              <div>
                <Input
                  label="Effective Date *"
                  type="date"
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                  required
                />
                <div className="text-[11px] mt-1 flex items-center gap-1">
                  {isCompliant ? (
                    <span className="text-emerald-600 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      Compliant: {daysNotice} days notice (min {minNoticeDays})
                    </span>
                  ) : (
                    <span className="text-amber-600 font-semibold flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Notice deficit: {daysNotice} days (&lt; {minNoticeDays} days required)
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div>
              <Select
                label="Statutory Justification / Reason *"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              >
                <option value="Annual Cost-of-Living Adjustment">Annual Cost-of-Living Adjustment (CPI)</option>
                <option value="Market Benchmark Re-alignment">Market Benchmark Re-alignment</option>
                <option value="Capital Improvement & Renovation">Capital Improvement & Unit Modernization</option>
                <option value="Lease Renewal Increment">Lease Renewal Term Revision</option>
                <option value="Operating Cost Inflation">Utility & Operational Cost Offset</option>
              </Select>
            </div>

            {!isCompliant && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  <strong>Statutory Warning:</strong> Setting the effective date earlier than {minNoticeDays} days
                  from today ({daysNotice} days given) may give the tenant grounds for legal dispute under {pack.name} tenancy laws.
                </span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowAddForm(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" className="gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                <span>Apply Rent Increase</span>
              </Button>
            </div>
          </form>
        )}

        {/* History List */}
        <div className="space-y-3">
          {increases.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-[var(--border-subtle)] rounded-2xl text-xs text-[var(--text-secondary)]">
              No historical rent increases recorded for Unit {unit.name}. Click "Record Rent Increase" above to add
              one.
            </div>
          ) : (
            increases.map((inc) => {
              const diffMinor = inc.new_amount_minor - inc.old_amount_minor;
              const pct = inc.old_amount_minor > 0 ? ((diffMinor / inc.old_amount_minor) * 100).toFixed(1) : '0';

              return (
                <div
                  key={inc.id}
                  className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)] flex flex-wrap items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-[var(--text-primary)]">
                        {formatMoney(inc.new_amount_minor, pack)}
                      </span>
                      <span className="text-xs text-[var(--text-secondary)] line-through">
                        {formatMoney(inc.old_amount_minor, pack)}
                      </span>
                      <Badge variant={diffMinor > 0 ? 'warning' : 'neutral'}>
                        {diffMinor > 0 ? `+${pct}%` : `${pct}%`}
                      </Badge>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)]">{inc.reason || 'Rent Revision'}</p>
                  </div>

                  <div className="text-right text-xs">
                    <div className="flex items-center gap-1.5 text-[var(--text-primary)] font-medium">
                      <Calendar className="w-3.5 h-3.5 text-[var(--text-subtle)]" />
                      <span>Effective: {inc.effective_date}</span>
                    </div>
                    <span className="text-[11px] text-[var(--text-secondary)]">
                      Recorded {new Date(inc.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="flex justify-end pt-3 border-t border-[var(--border-subtle)]">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
};
