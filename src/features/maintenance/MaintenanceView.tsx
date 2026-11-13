import React, { useState } from 'react';
import { db } from '../../db/client';
import { MaintenanceRequest, Unit, Vendor, Expense, Property } from '../../db/schema';
import { usePack } from '../../countries/usePack';
import { formatMoney, parseMajorToMinor } from '../../lib/money';
import { useAppSettingsStore } from '../../stores/appSettingsStore';
import { generateUUID } from '../../lib/uuid';
import { useToast } from '../../components/toast/ToastContext';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import {
  Wrench,
  Plus,
  HardHat,
  AlertCircle,
  Trash2,
  Pencil,
  CheckCircle,
  Play,
  UserCheck,
  ShieldCheck,
  ShieldAlert,
} from '../../components/icons';

export const MaintenanceView: React.FC = () => {
  const pack = usePack();
  const { showToast } = useToast();
  const [requests, setRequests] = useState<MaintenanceRequest[]>(() =>
    db.getTable<MaintenanceRequest>('maintenance_requests').filter((m) => !m.deleted_at && !(m as any).deletedAt)
  );

  // Strict filtering for active properties and units (deletedAt == null)
  const properties = db.getTable<Property>('properties').filter((p) => !p.deleted_at && !(p as any).deletedAt);
  const activePropertyIds = new Set(properties.map((p) => p.id));
  const propertyMap = new Map(properties.map((p) => [p.id, p]));
  const units = db.getTable<Unit>('units').filter(
    (u) => !u.deleted_at && !(u as any).deletedAt && activePropertyIds.has(u.property_id)
  );
  const vendors = db.getTable<Vendor>('vendors').filter((v) => !v.deleted_at && !(v as any).deletedAt);

  const approvalThresholdMinor = useAppSettingsStore((s) => s.maintenanceApprovalThresholdMinor);

  // Modals
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [selectedReqId, setSelectedReqId] = useState<string | null>(null);

  // Form states
  const [unitId, setUnitId] = useState(units[0]?.id || '');
  const [category, setCategory] = useState<
    'plumbing' | 'electrical' | 'hvac' | 'appliance' | 'structural' | 'other'
  >('plumbing');
  const [description, setDescription] = useState('');
  const [urgency, setUrgency] = useState<'low' | 'medium' | 'high' | 'emergency'>('high');

  // Assign vendor form
  const [vendorId, setVendorId] = useState(vendors[0]?.id || '');
  const [estimatedCost, setEstimatedCost] = useState('150');

  const handleCreateRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!unitId || !description) return;

    db.insertItem<MaintenanceRequest>('maintenance_requests', {
      id: generateUUID(),
      unit_id: unitId,
      category,
      description,
      urgency,
      status: 'new',
      cost_minor: 0,
      paid_by: 'landlord',
    });

    setRequests(db.getTable<MaintenanceRequest>('maintenance_requests').filter((m) => !m.deleted_at && !(m as any).deletedAt));
    setIsAddOpen(false);
    setDescription('');
    showToast({ type: 'success', message: 'New maintenance request logged' });
  };

  const handleAssignVendor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReqId || !vendorId) return;

    const costMinor = parseMajorToMinor(estimatedCost, pack);
    const needsApproval = costMinor > approvalThresholdMinor;

    db.updateItem<MaintenanceRequest>('maintenance_requests', selectedReqId, {
      vendor_id: vendorId,
      cost_minor: costMinor,
      needs_approval: needsApproval,
      status: 'assigned',
    });

    setRequests(db.getTable<MaintenanceRequest>('maintenance_requests').filter((m) => !m.deleted_at && !(m as any).deletedAt));
    setIsAssignOpen(false);
    setSelectedReqId(null);
    showToast({
      type: needsApproval ? 'info' : 'success',
      message: needsApproval
        ? `Contractor assigned. Cost exceeds approval limit (${formatMoney(approvalThresholdMinor, pack)}) — admin sign-off needed.`
        : 'Contractor assigned to work order',
    });
  };

  const handleApproveCost = (reqId: string) => {
    db.updateItem<MaintenanceRequest>('maintenance_requests', reqId, {
      needs_approval: false,
      approved_by: 'Admin Office',
      approved_at: new Date().toISOString(),
    });
    db.recordAudit('MAINTENANCE_COST_APPROVED', 'maintenance_requests', reqId);
    setRequests(db.getTable<MaintenanceRequest>('maintenance_requests').filter((m) => !m.deleted_at && !(m as any).deletedAt));
    showToast({ type: 'success', message: 'Maintenance repair cost approved by admin' });
  };

  const handleMoveStatus = (
    reqId: string,
    status: 'new' | 'assigned' | 'in_progress' | 'completed'
  ) => {
    const req = requests.find((r) => r.id === reqId);
    if (!req) return;

    // Feature 2.7: Approval rule check
    if (status === 'completed' && req.cost_minor > approvalThresholdMinor && !req.approved_at) {
      showToast({
        type: 'error',
        message: `Approval Required: Cost (${formatMoney(req.cost_minor, pack)}) exceeds threshold (${formatMoney(approvalThresholdMinor, pack)}). Approve cost before marking completed!`,
      });
      return;
    }

    db.updateItem<MaintenanceRequest>('maintenance_requests', reqId, {
      status,
      completed_at: status === 'completed' ? new Date().toISOString() : req.completed_at,
    });

    // Auto-create expense when completed
    if (status === 'completed' && req.cost_minor > 0) {
      const unit = units.find((u) => u.id === req.unit_id);
      db.insertItem<Expense>('expenses', {
        id: generateUUID(),
        org_id: 'org_demo_1',
        property_id: unit?.property_id || null,
        unit_id: req.unit_id,
        category: 'repairs_and_maintenance',
        amount_minor: req.cost_minor,
        currency_code: pack.currency.code,
        expense_date: new Date().toISOString().slice(0, 10),
        vendor_id: req.vendor_id || null,
        notes: `Work Order #${req.id.slice(-6)}: ${req.description}`,
      });
      showToast({ type: 'success', message: 'Work order completed and logged to operating expenses' });
    }

    setRequests(db.getTable<MaintenanceRequest>('maintenance_requests').filter((m) => !m.deleted_at && !(m as any).deletedAt));
  };

  const handleDeleteTask = (reqId: string) => {
    db.softDeleteItem<MaintenanceRequest>('maintenance_requests', reqId);
    setRequests(db.getTable<MaintenanceRequest>('maintenance_requests').filter((m) => !m.deleted_at && !(m as any).deletedAt));
  };

  const columns = [
    { key: 'new', label: '1. Intake (New)', variant: 'info' as const },
    { key: 'assigned', label: '2. Assigned', variant: 'warning' as const },
    { key: 'in_progress', label: '3. In Progress', variant: 'warning' as const },
    { key: 'completed', label: '4. Completed', variant: 'success' as const },
  ];

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Maintenance Request Kanban
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Work order lifecycle &bull; Contractor assignment &bull; Expense attribution
          </p>
        </div>
        <Button variant="primary" onClick={() => setIsAddOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          <span>New Work Order</span>
        </Button>
      </div>

      {/* Kanban Board Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {columns.map((col) => {
          const colItems = requests.filter((r) => r.status === col.key);

          return (
            <div
              key={col.key}
              className="p-4 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] min-h-[560px] flex flex-col justify-between card-shadow"
            >
              <div>
                <div className="flex items-center justify-between mb-4 px-1">
                  <span className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                    {col.label}
                  </span>
                  <Badge variant={col.variant}>{colItems.length}</Badge>
                </div>

                <div className="space-y-3">
                  {colItems.map((req) => {
                    const unit = units.find((u) => u.id === req.unit_id);
                    const vendor = vendors.find((v) => v.id === req.vendor_id);
                    const isUrgent = req.urgency === 'emergency' || req.urgency === 'high';

                    return (
                      <div
                        key={req.id}
                        className="p-4 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)] space-y-3 hover:border-[var(--border-strong)] transition-all"
                      >
                        <div className="flex items-center justify-between gap-2 min-w-0">
                          <span className="text-xs font-bold text-[var(--accent)] uppercase tracking-wider truncate min-w-0 flex-1">
                            {req.category}
                          </span>
                          <Badge variant={isUrgent ? 'danger' : 'neutral'} size="sm">
                            {req.urgency}
                          </Badge>
                        </div>

                        <p className="text-xs font-semibold text-[var(--text-primary)] line-clamp-2">
                          {req.description}
                        </p>
                        <p className="text-[11px] text-[var(--text-secondary)] truncate">Unit: {unit?.name || 'All Units'}</p>

                        {vendor && (
                          <div className="text-[11px] text-[var(--text-secondary)] flex items-center gap-1.5 pt-1 border-t border-[var(--border-subtle)] min-w-0">
                            <HardHat className="w-3.5 h-3.5 text-[var(--text-subtle)] shrink-0" />
                            <span className="truncate">Vendor: <strong>{vendor.name}</strong></span>
                          </div>
                        )}

                        <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between">
                          <span className="text-xs font-mono font-bold number-tabular text-[var(--text-primary)]">
                            {formatMoney(req.cost_minor, pack)}
                          </span>
                          <button
                            onClick={() => handleDeleteTask(req.id)}
                            className="w-6 h-6 rounded-md flex items-center justify-center text-[var(--text-subtle)] hover:text-[var(--status-danger-fg)] hover:bg-[var(--bg-surface)] cursor-pointer"
                            title="Delete task"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Feature 2.7: Approval threshold status & action */}
                        {req.cost_minor > approvalThresholdMinor && (
                          <div className="pt-1">
                            {req.approved_at ? (
                              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 text-[11px] font-semibold flex items-center gap-1.5">
                                <ShieldCheck className="w-3.5 h-3.5" />
                                <span>Approved by {req.approved_by || 'Admin'}</span>
                              </div>
                            ) : (
                              <div className="space-y-1.5">
                                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 text-[11px] font-semibold flex items-center gap-1.5">
                                  <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                                  <span>Exceeds {formatMoney(approvalThresholdMinor, pack)} limit</span>
                                </div>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleApproveCost(req.id)}
                                  className="w-full h-7 text-xs text-amber-700 dark:text-amber-300 border-amber-500/40 hover:bg-amber-500/10"
                                >
                                  Approve Cost ({formatMoney(req.cost_minor, pack)})
                                </Button>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Action buttons */}
                        <div className="pt-1 flex flex-wrap gap-2">
                          {col.key === 'new' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full h-7 text-xs gap-1.5 rounded-lg"
                              onClick={() => {
                                setSelectedReqId(req.id);
                                setIsAssignOpen(true);
                              }}
                            >
                              <UserCheck className="w-3.5 h-3.5 text-[var(--accent)]" />
                              <span>Assign Contractor</span>
                            </Button>
                          )}

                          {col.key === 'assigned' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full h-7 text-xs gap-1.5 rounded-lg text-amber-600 border-amber-500/30 hover:bg-amber-500/10"
                              onClick={() => handleMoveStatus(req.id, 'in_progress')}
                            >
                              <Play className="w-3.5 h-3.5" />
                              <span>Start Repairs</span>
                            </Button>
                          )}

                          {col.key === 'in_progress' && (
                            <Button
                              size="sm"
                              variant="primary"
                              className="w-full h-7 text-xs gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700"
                              onClick={() => handleMoveStatus(req.id, 'completed')}
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                              <span>Mark Fixed</span>
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Order Modal */}
      <Modal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title="Create Maintenance Request"
        description="Log an issue report for dispatch to contractors."
        maxWidth="lg"
      >
        <form onSubmit={handleCreateRequest} className="space-y-4">
          <Select
            label="Select Unit *"
            value={unitId}
            onChange={(e) => setUnitId(e.target.value)}
          >
            {units.length === 0 ? (
              <option value="" disabled>
                No active units available
              </option>
            ) : (
              units.map((u) => {
                const prop = propertyMap.get(u.property_id);
                return (
                  <option key={u.id} value={u.id}>
                    {u.name} {prop ? `(${prop.name})` : ''}
                  </option>
                );
              })
            )}
          </Select>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Category"
              value={category}
              onChange={(e) => setCategory(e.target.value as any)}
            >
              <option value="plumbing">Plumbing</option>
              <option value="electrical">Electrical</option>
              <option value="hvac">HVAC / Heating</option>
              <option value="appliance">Appliance</option>
              <option value="structural">Structural</option>
              <option value="other">Other</option>
            </Select>

            <Select
              label="Urgency"
              value={urgency}
              onChange={(e) => setUrgency(e.target.value as any)}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="emergency">Emergency</option>
            </Select>
          </div>

          <Input
            label="Issue Description *"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the issue in detail"
            required
          />

          <div className="flex justify-end gap-3 pt-3 border-t border-[var(--border-subtle)]">
            <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Create Work Request
            </Button>
          </div>
        </form>
      </Modal>

      {/* Assign Vendor Modal */}
      <Modal
        isOpen={isAssignOpen}
        onClose={() => setIsAssignOpen(false)}
        title="Assign Contractor Vendor"
        maxWidth="md"
      >
        <form onSubmit={handleAssignVendor} className="space-y-4">
          <Select
            label="Select Vendor *"
            value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
          >
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} ({v.category})
              </option>
            ))}
          </Select>

          <Input
            label={`Estimated Repair Cost (${pack.currency.code})`}
            type="number"
            value={estimatedCost}
            onChange={(e) => setEstimatedCost(e.target.value)}
            required
          />

          <div className="flex justify-end gap-3 pt-3 border-t border-[var(--border-subtle)]">
            <Button type="button" variant="outline" onClick={() => setIsAssignOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Assign Vendor
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
