import React, { useState } from 'react';
import {
  AreaUnit,
  AREA_UNIT_LABELS,
  AREA_FACTORS_TO_SQM,
  convertArea,
} from '../../lib/units';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Calculator, ArrowUpDown, Copy, Layers } from '../../components/icons';
import { useToast } from '../../components/toast/ToastContext';

export const AreaCalculatorView: React.FC = () => {
  const { showToast } = useToast();
  const [inputValue, setInputValue] = useState('1000');
  const [fromUnit, setFromUnit] = useState<AreaUnit>('sqft');
  const [toUnit, setToUnit] = useState<AreaUnit>('sqm');

  const numericInput = parseFloat(inputValue) || 0;
  const converted = convertArea(numericInput, fromUnit, toUnit);

  const unitKeys = Object.keys(AREA_FACTORS_TO_SQM) as AreaUnit[];

  const handleSwap = () => {
    const prevFrom = fromUnit;
    setFromUnit(toUnit);
    setToUnit(prevFrom);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast({ type: 'success', message: 'Conversion result copied to clipboard!' });
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-[var(--text)]">Land & Property Area Converter</h1>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">
          Section 8.4 Land Engine &bull; Support for International & South Asian units (Marla, Kanal, Bigha, Gaj, Sq Ft, Sq Meters)
        </p>
      </div>

      <Card className="p-6 space-y-6">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Calculator className="w-5 h-5 text-[var(--accent)]" />
            <CardTitle>Bespoke Land Unit Calculator</CardTitle>
          </div>
          <Badge variant="info">Tabular Precision (2 decimals)</Badge>
        </CardHeader>

        {/* Input & Units Grid */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
          <div className="md:col-span-2">
            <Input
              label="Enter Area Value"
              type="number"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              className="text-lg font-bold font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">
              From Unit
            </label>
            <select
              value={fromUnit}
              onChange={(e) => setFromUnit(e.target.value as AreaUnit)}
              className="w-full h-9 rounded-[6px] border border-[var(--border)] bg-[var(--bg)] px-3 text-xs text-[var(--text)] focus-ring"
            >
              {unitKeys.map((u) => (
                <option key={u} value={u}>
                  {AREA_UNIT_LABELS[u]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-center pb-0.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSwap}
              className="h-9 px-3 gap-1"
              title="Swap Units"
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
            </Button>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">
              To Unit
            </label>
            <select
              value={toUnit}
              onChange={(e) => setToUnit(e.target.value as AreaUnit)}
              className="w-full h-9 rounded-[6px] border border-[var(--border)] bg-[var(--bg)] px-3 text-xs text-[var(--text)] focus-ring"
            >
              {unitKeys.map((u) => (
                <option key={u} value={u}>
                  {AREA_UNIT_LABELS[u]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Output Display Card */}
        <div className="p-5 rounded-[8px] bg-[var(--surface-sunken)] border border-[var(--border)] flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
              Converted Result
            </span>
            <div className="text-3xl font-bold font-mono text-[var(--accent)] mt-1">
              {converted.toLocaleString()}{' '}
              <span className="text-sm font-normal text-[var(--text-muted)]">
                {AREA_UNIT_LABELS[toUnit]}
              </span>
            </div>
            <p className="text-xs text-[var(--text-subtle)] mt-1">
              {numericInput.toLocaleString()} {AREA_UNIT_LABELS[fromUnit]} ={' '}
              {converted.toLocaleString()} {AREA_UNIT_LABELS[toUnit]}
            </p>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handleCopy(`${converted} ${AREA_UNIT_LABELS[toUnit]}`)}
            className="gap-1.5"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Copy Value</span>
          </Button>
        </div>

        {/* Reference Quick Conversion Matrix */}
        <div className="space-y-3 pt-4 border-t border-[var(--border)]">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Regional Standard Benchmarks ({numericInput.toLocaleString()} {AREA_UNIT_LABELS[fromUnit]})
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-[6px] border border-[var(--border)] bg-[var(--surface)]">
              <span className="text-[10px] text-[var(--text-subtle)] block">Square Feet</span>
              <span className="font-bold font-mono text-sm text-[var(--text)]">
                {convertArea(numericInput, fromUnit, 'sqft').toLocaleString()} sqft
              </span>
            </div>

            <div className="p-3 rounded-[6px] border border-[var(--border)] bg-[var(--surface)]">
              <span className="text-[10px] text-[var(--text-subtle)] block">Square Meters</span>
              <span className="font-bold font-mono text-sm text-[var(--text)]">
                {convertArea(numericInput, fromUnit, 'sqm').toLocaleString()} m²
              </span>
            </div>

            <div className="p-3 rounded-[6px] border border-[var(--border)] bg-[var(--surface)]">
              <span className="text-[10px] text-[var(--text-subtle)] block">Marla (PK)</span>
              <span className="font-bold font-mono text-sm text-[var(--text)]">
                {convertArea(numericInput, fromUnit, 'marla_pk').toLocaleString()} Marla
              </span>
            </div>

            <div className="p-3 rounded-[6px] border border-[var(--border)] bg-[var(--surface)]">
              <span className="text-[10px] text-[var(--text-subtle)] block">Kanal (PK)</span>
              <span className="font-bold font-mono text-sm text-[var(--text)]">
                {convertArea(numericInput, fromUnit, 'kanal_pk').toLocaleString()} Kanal
              </span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};
