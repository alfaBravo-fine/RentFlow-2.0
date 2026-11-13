import React, { useState } from 'react';
import { listAllPacks, getCountryPack } from '../../countries/resolver';
import { CountryPack } from '../../countries/types';
import { usePackStore } from '../../countries/usePack';
import { formatMoney } from '../../lib/money';
import { useToast } from '../../components/toast/ToastContext';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Globe, Check, Shield, AlertCircle } from '../../components/icons';
import { useNavigate } from 'react-router-dom';

export const OnboardingView: React.FC = () => {
  const packs = listAllPacks();
  const currentCode = usePackStore((s) => s.countryCode);
  const setCountryCode = usePackStore((s) => s.setCountryCode);
  const { showToast } = useToast();

  const [selectedCode, setSelectedCode] = useState(currentCode);
  const navigate = useNavigate();

  const selectedPack = getCountryPack(selectedCode);

  const handleApplyPack = () => {
    setCountryCode(selectedCode);
    showToast({
      type: 'success',
      message: `Jurisdiction updated to ${selectedPack.name} (${selectedPack.currency.code})!`,
    });
    navigate('/');
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 py-4">
      <div>
        <h1 className="text-xl font-bold text-[var(--text)] flex items-center gap-2">
          <Globe className="w-5 h-5 text-[var(--accent)]" />
          <span>Country Pack Regional Customization</span>
        </h1>
        <p className="text-xs text-[var(--text-muted)] mt-1">
          Select your operating jurisdiction to configure statutory deposit limits, late fee rules, tax parameters, and localized currency formatting.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: 9 Country Packs List */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider block mb-2">
            Available Country Packs
          </label>
          {packs.map((p) => {
            const isSelected = p.code === selectedCode;
            return (
              <button
                key={p.code}
                onClick={() => setSelectedCode(p.code)}
                className={`w-full text-left p-3 rounded-[6px] border transition-all flex items-center justify-between cursor-pointer ${
                  isSelected
                    ? 'border-[var(--accent)] bg-[var(--accent-subtle)] font-semibold ring-1 ring-[var(--accent)]'
                    : 'border-[var(--border)] bg-[var(--surface-raised)] hover:bg-[var(--surface)]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{p.flag}</span>
                  <div>
                    <p className="text-sm text-[var(--text)]">{p.name}</p>
                    <p className="text-xs text-[var(--text-subtle)] font-mono">
                      {p.currency.code} ({p.currency.symbol}) &bull; {p.areaUnit}
                    </p>
                  </div>
                </div>
                {isSelected && <Check className="w-4 h-4 text-[var(--accent)]" />}
              </button>
            );
          })}
        </div>

        {/* Right Column: Live Rules Preview Card */}
        <div className="md:col-span-2">
          <Card className="sticky top-6 space-y-6">
            <CardHeader>
              <div className="flex items-center gap-3">
                <span className="text-3xl">{selectedPack.flag}</span>
                <div>
                  <CardTitle>{selectedPack.name} Jurisdiction Rules</CardTitle>
                  <p className="text-xs text-[var(--text-muted)]">
                    Locale: {selectedPack.locale} &bull; Area: {selectedPack.areaUnit.toUpperCase()}
                  </p>
                </div>
              </div>
              <Badge variant="info">Pack v{selectedPack.version}</Badge>
            </CardHeader>

            {/* Currency Preview Box */}
            <div className="p-4 rounded-[6px] border border-[var(--border)] bg-[var(--surface)] space-y-2">
              <span className="text-xs font-semibold text-[var(--text-muted)] uppercase">
                Live Currency Formatting Sample
              </span>
              <div className="text-2xl font-bold number-tabular text-[var(--accent)]">
                {formatMoney(125000, selectedPack)}
              </div>
              <p className="text-xs text-[var(--text-subtle)] font-mono">
                Minor Units: {selectedPack.currency.minorUnits} &bull; Decimal: "{selectedPack.currency.decimalSeparator}" &bull; Grouping: {selectedPack.currency.groupingStyle}
              </p>
            </div>

            {/* Legal Deposit & Late Fee Rules Grid */}
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="p-3 rounded-[6px] border border-[var(--border)] bg-[var(--bg)] space-y-1">
                <p className="font-semibold text-[var(--text)] flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-[var(--accent)]" />
                  Security Deposit Rules
                </p>
                <p className="text-[var(--text-muted)]">
                  Cap: {selectedPack.deposit.maxMonths ? `${selectedPack.deposit.maxMonths} Months Rent` : 'No National Cap'}
                </p>
                <p className="text-[var(--text-muted)]">
                  Interest Required: {selectedPack.deposit.interestRequired ? 'Yes (Statutory)' : 'No'}
                </p>
                <p className="text-[var(--text-muted)]">
                  Scheme Required: {selectedPack.deposit.protectionSchemeRequired ? 'Yes' : 'No'}
                </p>
              </div>

              <div className="p-3 rounded-[6px] border border-[var(--border)] bg-[var(--bg)] space-y-1">
                <p className="font-semibold text-[var(--text)] flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 text-[var(--status-warning-fg)]" />
                  Late Fee Regulations
                </p>
                <p className="text-[var(--text-muted)]">Allowed: {selectedPack.lateFee.allowed.toUpperCase()}</p>
                <p className="text-[var(--text-muted)]">
                  Max Cap: {selectedPack.lateFee.maxValue ? `${selectedPack.lateFee.maxValue}% / Fixed` : 'Uncapped'}
                </p>
                <p className="text-[var(--text-muted)]">
                  Islamic Mode: {selectedPack.lateFee.islamicFinanceMode ? 'Yes (Charity)' : 'Standard'}
                </p>
              </div>
            </div>

            {/* Legal Notes List */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-[var(--text-muted)] uppercase">
                Statutory Legal Notes
              </span>
              <ul className="space-y-1 text-xs text-[var(--text-muted)] list-disc pl-4">
                {selectedPack.legalNotes.map((note, idx) => (
                  <li key={idx}>{note}</li>
                ))}
              </ul>
            </div>

            <Button variant="primary" className="w-full" onClick={handleApplyPack}>
              Apply {selectedPack.name} Jurisdiction Pack
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
};
