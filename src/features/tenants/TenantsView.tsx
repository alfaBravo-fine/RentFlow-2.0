import React, { useState, useEffect } from 'react';
import { db } from '../../db/client';
import { Tenant, Lease, Unit, TenantContactLog, Credit } from '../../db/schema';
import { generateUUID } from '../../lib/uuid';
import { getUnitDisplayName } from '../../lib/formatNames';
import { useToast } from '../../components/toast/ToastContext';
import { formatMoney } from '../../lib/money';
import { usePack } from '../../countries/usePack';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import {
  Users,
  Plus,
  Mail,
  Phone,
  ShieldCheck,
  UserPlus,
  Pencil,
  Trash2,
  Copy,
  LayoutGrid,
  List,
  MessageSquare,
  Clock,
  CheckCircle2,
  Receipt,
} from '../../components/icons';
import { TenantLedgerModal } from './TenantLedgerModal';
import { DestructiveConfirmationModal } from '../../components/ui/DestructiveConfirmationModal';

export const TenantsView: React.FC = () => {
  const pack = usePack();
  const { showToast } = useToast();
  const [tenants, setTenants] = useState<Tenant[]>(() =>
    db.getTable<Tenant>('tenants').filter((t) => !t.deleted_at && !(t as any).deletedAt)
  );
  const [leases, setLeases] = useState<Lease[]>(() =>
    db.getTable<Lease>('leases').filter((l) => !l.deleted_at && !(l as any).deletedAt)
  );
  const [units, setUnits] = useState<Unit[]>(() =>
    db.getTable<Unit>('units').filter((u) => !u.deleted_at && !(u as any).deletedAt)
  );
  const [credits, setCredits] = useState<Credit[]>(() =>
    db
      .getTable<Credit>('credits')
      .filter(
        (c) =>
          !c.deleted_at &&
          !(c as any).deletedAt &&
          (c.status === 'active' || c.status === 'partially_used') &&
          (c.amount_minor || 0) > 0
      )
  );
  const [contactLogs, setContactLogs] = useState<TenantContactLog[]>(() =>
    db.getTable<TenantContactLog>('tenant_contact_logs').filter((l) => !l.deleted_at && !(l as any).deletedAt)
  );

  useEffect(() => {
    const unsub = db.onWrite(() => {
      setTenants(db.getTable<Tenant>('tenants').filter((t) => !t.deleted_at && !(t as any).deletedAt));
      setLeases(db.getTable<Lease>('leases').filter((l) => !l.deleted_at && !(l as any).deletedAt));
      setUnits(db.getTable<Unit>('units').filter((u) => !u.deleted_at && !(u as any).deletedAt));
      setCredits(
        db
          .getTable<Credit>('credits')
          .filter(
            (c) =>
              !c.deleted_at &&
              !(c as any).deletedAt &&
              (c.status === 'active' || c.status === 'partially_used') &&
              (c.amount_minor || 0) > 0
          )
      );
      setContactLogs(
        db.getTable<TenantContactLog>('tenant_contact_logs').filter((l) => !l.deleted_at && !(l as any).deletedAt)
      );
    });
    return unsub;
  }, []);

  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [deletingTenant, setDeletingTenant] = useState<Tenant | null>(null);

  const [contactLogTenant, setContactLogTenant] = useState<Tenant | null>(null);
  const [selectedLedgerTenant, setSelectedLedgerTenant] = useState<Tenant | null>(null);
  const [newLogChannel, setNewLogChannel] = useState<'email' | 'phone_call' | 'in_person'>('phone_call');
  const [newLogSummary, setNewLogSummary] = useState('');
  const [newLogDetails, setNewLogDetails] = useState('');

  // Form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [idType, setIdType] = useState("State Driver's License");
  const [idNumber, setIdNumber] = useState('');
  const [emergencyName, setEmergencyName] = useState('');
  const [occupants, setOccupants] = useState('1');

  const handleOpenAdd = () => {
    setEditingTenant(null);
    setName('');
    setEmail('');
    setPhone('');
    setIdType("State Driver's License");
    setIdNumber('');
    setEmergencyName('');
    setOccupants('1');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (t: Tenant) => {
    setEditingTenant(t);
    setName(t.name);
    setEmail(t.email);
    setPhone(t.phone);
    setIdType(t.id_type || "State Driver's License");
    setIdNumber(t.id_number || '');
    setEmergencyName(t.emergency_contact || '');
    setOccupants(String(t.occupants || 1));
    setIsModalOpen(true);
  };

  const handleSaveTenant = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      showToast({ type: 'error', message: 'Tenant name is required!' });
      return;
    }
    if (!phone.trim()) {
      showToast({ type: 'error', message: 'Tenant phone number is required!' });
      return;
    }
    if (!idNumber.trim()) {
      showToast({ type: 'error', message: 'Identity document number is required!' });
      return;
    }

    if (editingTenant) {
      db.updateItem<Tenant>('tenants', editingTenant.id, {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        id_type: idType,
        id_number: idNumber.trim(),
        emergency_contact: emergencyName.trim() || null,
        occupants: parseInt(occupants) || 1,
      });
      showToast({ type: 'success', message: `Tenant "${name}" updated` });
    } else {
      const created = db.insertItem<Tenant>('tenants', {
        id: generateUUID(),
        org_id: 'org_demo_1',
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        id_type: idType,
        id_number: idNumber.trim(),
        emergency_contact: emergencyName.trim() || null,
        occupants: parseInt(occupants) || 1,
      });
      showToast({ type: 'success', message: `Tenant "${created.name}" registered` });
    }

    setTenants(db.getTable<Tenant>('tenants').filter((t) => !t.deleted_at && !(t as any).deletedAt));
    setIsModalOpen(false);
  };

  const handleConfirmDeleteTenant = () => {
    if (!deletingTenant) return;
    const targetName = deletingTenant.name;
    const success = db.deleteTenantCascading(deletingTenant.id);
    if (success) {
      setTenants(db.getTable<Tenant>('tenants').filter((t) => !t.deleted_at && !(t as any).deletedAt));
      showToast({
        type: 'info',
        message: `Tenant "${targetName}" and linked active leases archived`,
      });
    }
    setDeletingTenant(null);
  };

  const handleAddContactLog = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactLogTenant || !newLogSummary.trim()) {
      showToast({ type: 'error', message: 'Summary is required!' });
      return;
    }

    db.insertItem<TenantContactLog>('tenant_contact_logs', {
      id: generateUUID(),
      tenant_id: contactLogTenant.id,
      channel: newLogChannel,
      summary: newLogSummary.trim(),
      details: newLogDetails.trim() || null,
      user_name: 'Property Staff',
      created_at: Date.now(),
    });

    setContactLogs(db.getTable<TenantContactLog>('tenant_contact_logs').filter((l) => !l.deleted_at && !(l as any).deletedAt));
    setNewLogSummary('');
    setNewLogDetails('');
    showToast({ type: 'success', message: 'Communication note recorded' });
  };

  const handleCopyPhone = (ph: string, tName: string) => {
    navigator.clipboard.writeText(ph);
    showToast({ type: 'success', message: `Copied ${tName}'s phone to clipboard!` });
  };

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Tenants Directory
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Verified resident records &bull; Identity documents &bull; Account ledgers &amp; communication history
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* View Mode Switcher */}
          <div className="flex items-center p-1 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-strong)]">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-[var(--accent)]/10 text-[var(--accent)] font-semibold'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
              title="Grid View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-[var(--accent)]/10 text-[var(--accent)] font-semibold'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
              title="Table View"
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          <Button variant="primary" onClick={handleOpenAdd} className="gap-2">
            <UserPlus className="w-4 h-4" />
            <span>Add Tenant</span>
          </Button>
        </div>
      </div>

      {/* Main Content */}
      {tenants.length === 0 ? (
        <Card className="p-12 text-center space-y-4 max-w-xl mx-auto my-8">
          <div className="w-16 h-16 rounded-3xl bg-[var(--accent-subtle)] text-[var(--accent)] flex items-center justify-center mx-auto shadow-sm">
            <Users className="w-8 h-8" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-lg font-bold tracking-tight text-[var(--text-primary)]">
              No Tenants Registered Yet
            </h3>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed max-w-md mx-auto">
              Create resident profiles with verified government IDs, emergency contacts, occupant counts, and full resident account ledgers.
            </p>
          </div>
          <div className="pt-2">
            <Button
              size="lg"
              variant="primary"
              onClick={handleOpenAdd}
              className="gap-2.5 px-6 shadow-md hover:shadow-lg transition-all"
            >
              <UserPlus className="w-5 h-5" />
              <span>+ Add Tenant</span>
            </Button>
          </div>
        </Card>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tenants.map((t) => {
            const tenantLeases = leases.filter((l) => l.tenant_id === t.id);
            const tenantLease = tenantLeases.find((l) => l.status === 'active');
            const tenantUnit = tenantLease ? units.find((u) => u.id === tenantLease.unit_id) : null;

            const tenantLeaseIds = tenantLeases.map((l) => l.id);
            const tenantCredits = credits.filter(
              (c) =>
                (c.tenant_id === t.id || (c as any).tenantId === t.id) ||
                (c.lease_id && tenantLeaseIds.includes(c.lease_id))
            );
            const creditBalanceMinor = tenantCredits.reduce((sum, c) => sum + (c.amount_minor || 0), 0);

            return (
              <Card key={t.id} className="flex flex-col justify-between space-y-4 hover:border-[var(--accent)]/40 transition-colors">
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-11 h-11 rounded-2xl bg-[var(--accent-subtle)] text-[var(--accent)] font-bold flex items-center justify-center text-base shrink-0 shadow-xs">
                        {t.name[0]}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <h3 className="text-sm font-bold text-[var(--text-primary)] truncate">{t.name}</h3>
                          {creditBalanceMinor > 0 && (
                            <Badge variant="success" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 font-bold font-mono text-[11px] shrink-0">
                              Credit Balance: {formatMoney(creditBalanceMinor, pack)}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-[var(--text-secondary)] flex items-center gap-1 mt-0.5 truncate">
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span className="truncate">{t.id_type}: {t.id_number}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => setSelectedLedgerTenant(t)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--bg-base)] cursor-pointer"
                        title="View Account Ledger & Balance"
                      >
                        <Receipt className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setContactLogTenant(t)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--bg-base)] cursor-pointer"
                        title="Communication Log & Staff Notes"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleOpenEdit(t)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--bg-base)] cursor-pointer"
                        title="Edit Tenant"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeletingTenant(t)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--status-danger-fg)] hover:bg-[var(--bg-base)] cursor-pointer"
                        title="Archive Tenant"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Lease Assignment Badge */}
                  <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
                    <Badge variant={tenantLease ? 'success' : 'neutral'}>
                      {tenantLease ? 'Active Resident' : 'Unassigned'}
                    </Badge>
                    {tenantUnit && (
                      <span className="text-xs font-bold text-[var(--accent)] truncate">
                        {getUnitDisplayName(tenantUnit)}
                      </span>
                    )}
                  </div>

                  {/* Contact Info */}
                  <div className="space-y-2 text-xs text-[var(--text-secondary)] pt-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-[var(--text-subtle)] shrink-0" />
                        <span className="font-mono">{t.phone}</span>
                      </div>
                      <button
                        onClick={() => handleCopyPhone(t.phone, t.name)}
                        className="text-[11px] text-[var(--accent)] hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <Copy className="w-3 h-3" />
                        <span>Copy</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-[var(--text-subtle)] shrink-0" />
                      <span className="truncate">{t.email || 'No email on file'}</span>
                    </div>

                    {t.emergency_contact && (
                      <div className="text-[11px] text-[var(--text-subtle)] truncate pt-1">
                        Emergency: {t.emergency_contact}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        /* Modern 56px Row Height Table View */
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-base)] text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                  <th className="py-3.5 px-6">Tenant Name</th>
                  <th className="py-3.5 px-6">Contact Phone</th>
                  <th className="py-3.5 px-6">Email Address</th>
                  <th className="py-3.5 px-6">Identity Verification</th>
                  <th className="py-3.5 px-6">Occupancy Status</th>
                  <th className="py-3.5 px-6">Credit Balance</th>
                  <th className="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)] text-sm">
                {tenants.map((t) => {
                  const tenantLeases = leases.filter((l) => l.tenant_id === t.id);
                  const tenantLease = tenantLeases.find((l) => l.status === 'active');
                  const tenantUnit = tenantLease ? units.find((u) => u.id === tenantLease.unit_id) : null;

                  const tenantLeaseIds = tenantLeases.map((l) => l.id);
                  const tenantCredits = credits.filter(
                    (c) =>
                      (c.tenant_id === t.id || (c as any).tenantId === t.id) ||
                      (c.lease_id && tenantLeaseIds.includes(c.lease_id))
                  );
                  const creditBalanceMinor = tenantCredits.reduce((sum, c) => sum + (c.amount_minor || 0), 0);

                  return (
                    <tr key={t.id} className="h-14 hover:bg-[var(--bg-base)] transition-colors">
                      <td className="py-3 px-6 font-semibold text-[var(--text-primary)]">
                        {t.name}
                      </td>
                      <td className="py-3 px-6 font-mono text-xs text-[var(--text-secondary)]">
                        {t.phone}
                      </td>
                      <td className="py-3 px-6 text-xs text-[var(--text-secondary)] truncate max-w-[200px]">
                        {t.email || '—'}
                      </td>
                      <td className="py-3 px-6 text-xs text-[var(--text-secondary)]">
                        {t.id_type}: <span className="font-mono">{t.id_number}</span>
                      </td>
                      <td className="py-3 px-6">
                        <Badge variant={tenantLease ? 'success' : 'neutral'}>
                          {tenantUnit ? getUnitDisplayName(tenantUnit) : 'Unassigned'}
                        </Badge>
                      </td>
                      <td className="py-3 px-6 font-mono font-semibold">
                        {creditBalanceMinor > 0 ? (
                          <Badge variant="success" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 font-bold font-mono text-[11px]">
                            Credit Balance: {formatMoney(creditBalanceMinor, pack)}
                          </Badge>
                        ) : (
                          <span className="text-[var(--text-subtle)] text-xs">—</span>
                        )}
                      </td>
                      <td className="py-3 px-6 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setSelectedLedgerTenant(t)}
                            className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--bg-surface-sunken)] transition-colors cursor-pointer"
                            title="View Account Ledger & Balance"
                          >
                            <Receipt className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setContactLogTenant(t)}
                            className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--bg-surface-sunken)] transition-colors cursor-pointer"
                            title="Communication Log & Staff Notes"
                          >
                            <MessageSquare className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleOpenEdit(t)}
                            className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--bg-surface-sunken)] transition-colors cursor-pointer"
                            title="Edit"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeletingTenant(t)}
                            className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--status-danger-fg)] hover:bg-[var(--bg-surface-sunken)] transition-colors cursor-pointer"
                            title="Archive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Feature 2.8: Tenant Communication & Contact Log Modal */}
      {contactLogTenant && (
        <Modal
          isOpen={!!contactLogTenant}
          onClose={() => setContactLogTenant(null)}
          title={`Communication Log: ${contactLogTenant.name}`}
          description={`Logged interactions, dispatch history, and staff notes for ${contactLogTenant.name} (${contactLogTenant.phone}).`}
          maxWidth="2xl"
        >
          <div className="space-y-6">
            {/* Quick Record Form */}
            <form onSubmit={handleAddContactLog} className="p-4 rounded-2xl bg-[var(--bg-base)] border border-[var(--border-subtle)] space-y-3">
              <h4 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
                <Plus className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span>Log New Interaction or Staff Note</span>
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Channel
                  </label>
                  <Select
                    value={newLogChannel}
                    onChange={(e) => setNewLogChannel(e.target.value as 'phone_call' | 'email' | 'in_person')}
                  >
                    <option value="phone_call">Phone Call</option>
                    <option value="email">Email Sent/Received</option>
                    <option value="in_person">In-Person Meeting</option>
                  </Select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Summary / Topic *
                  </label>
                  <Input
                    value={newLogSummary}
                    onChange={(e) => setNewLogSummary(e.target.value)}
                    placeholder="e.g. Discussed lease renewal term, verified utility payment"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  Detailed Notes (Optional)
                </label>
                <textarea
                  value={newLogDetails}
                  onChange={(e) => setNewLogDetails(e.target.value)}
                  placeholder="Record full context, tenant commitments, agreed dates, or maintenance follow-ups..."
                  rows={2}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] resize-none"
                />
              </div>

              <div className="flex justify-end pt-1">
                <Button type="submit" size="sm" variant="primary">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Record Interaction</span>
                </Button>
              </div>
            </form>

            {/* Interaction Timeline */}
            <div>
              <h4 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider mb-3 flex items-center justify-between">
                <span>Interaction History</span>
                <span className="text-[11px] font-normal text-[var(--text-secondary)]">
                  {contactLogs.filter((l) => l.tenant_id === contactLogTenant.id).length} recorded
                </span>
              </h4>

              <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {contactLogs.filter((l) => l.tenant_id === contactLogTenant.id).length === 0 ? (
                  <div className="p-6 rounded-2xl bg-[var(--bg-base)] border border-dashed border-[var(--border-strong)] text-center">
                    <MessageSquare className="w-8 h-8 text-[var(--text-subtle)] mx-auto mb-2" />
                    <p className="text-xs font-semibold text-[var(--text-primary)]">No interaction notes recorded yet</p>
                    <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">Use the form above to log phone calls, emails, or office visits.</p>
                  </div>
                ) : (
                  contactLogs
                    .filter((l) => l.tenant_id === contactLogTenant.id)
                    .sort((a, b) => b.created_at - a.created_at)
                    .map((log) => {
                      const channelBadgeColor: Record<string, string> = {
                        whatsapp: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
                        email: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
                        sms: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
                        phone_call: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
                        in_person: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
                      };

                      const channelLabel: Record<string, string> = {
                        whatsapp: 'WhatsApp',
                        email: 'Email',
                        sms: 'SMS',
                        phone_call: 'Phone Call',
                        in_person: 'In-Person',
                      };

                      return (
                        <div
                          key={log.id}
                          className="p-3.5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-xs space-y-1.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${
                                  channelBadgeColor[log.channel] || 'bg-gray-100 text-gray-700'
                                }`}
                              >
                                {channelLabel[log.channel] || log.channel}
                              </span>
                              <span className="text-xs font-bold text-[var(--text-primary)]">
                                {log.summary}
                              </span>
                            </div>
                            <span className="text-[11px] text-[var(--text-secondary)] font-mono shrink-0 flex items-center gap-1">
                              <Clock className="w-3 h-3 text-[var(--text-subtle)]" />
                              {new Date(log.created_at).toLocaleString([], {
                                dateStyle: 'short',
                                timeStyle: 'short',
                              })}
                            </span>
                          </div>

                          {log.details && (
                            <p className="text-xs text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap pl-1">
                              {log.details}
                            </p>
                          )}

                          <div className="text-[10px] text-[var(--text-subtle)] pl-1">
                            Logged by: <span className="font-medium text-[var(--text-secondary)]">{log.user_name || 'Staff'}</span>
                          </div>
                        </div>
                      );
                    })
                )}
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-[var(--border-subtle)]">
              <Button variant="outline" size="sm" onClick={() => setContactLogTenant(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Register / Edit Tenant */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingTenant ? `Edit Tenant: ${editingTenant.name}` : 'Register New Tenant'}
        description="Tenant contact data and verified identity document details."
        maxWidth="lg"
      >
        <form onSubmit={handleSaveTenant} className="space-y-4">
          <Input
            label="Full Legal Name *"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Eleanor Vance"
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Phone Number *"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. +1 555-0144"
              required
            />
            <Input
              label="Email Address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. eleanor.vance@example.com"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Identity Document Type *"
              value={idType}
              onChange={(e) => setIdType(e.target.value)}
            >
              <option value="State Driver's License">State Driver's License</option>
              <option value="National Passport">National Passport</option>
              <option value="National ID Card">National ID Card / CNIC / Civil ID</option>
              <option value="Residence Permit">Residence Permit / Green Card</option>
            </Select>

            <Input
              label="ID Document Number *"
              value={idNumber}
              onChange={(e) => setIdNumber(e.target.value)}
              placeholder="e.g. DL-982310492"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Emergency Contact Name"
              value={emergencyName}
              onChange={(e) => setEmergencyName(e.target.value)}
              placeholder="e.g. Robert Vance (Spouse)"
            />
            <Input
              label="Occupants Count"
              type="number"
              value={occupants}
              onChange={(e) => setOccupants(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-[var(--border-subtle)]">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              {editingTenant ? 'Save Tenant Changes' : 'Register Tenant'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Feature: Tenant Ledger Modal */}
      <TenantLedgerModal
        isOpen={!!selectedLedgerTenant}
        onClose={() => setSelectedLedgerTenant(null)}
        tenant={selectedLedgerTenant}
      />

      {/* Feature: High-Security Destructive Action Confirmation */}
      <DestructiveConfirmationModal
        isOpen={!!deletingTenant}
        onClose={() => setDeletingTenant(null)}
        onConfirm={handleConfirmDeleteTenant}
        title="Archive Tenant Profile"
        itemName={deletingTenant?.name || ''}
        itemType="Tenant"
        warningDetails="This will archive the tenant profile and cascade-archive linked leases, unpaid invoices, deposits, and credits while marking leased units vacant."
      />
    </div>
  );
};
