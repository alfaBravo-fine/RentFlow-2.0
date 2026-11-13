import React, { useState } from 'react';
import { db } from '../../db/client';
import { Vendor } from '../../db/schema';
import { generateUUID } from '../../lib/uuid';
import { useToast } from '../../components/toast/ToastContext';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import {
  HardHat,
  Plus,
  Phone,
  Mail,
  Pencil,
  Trash2,
  FileText,
  Star,
  Search,
} from '../../components/icons';

export const VendorsView: React.FC = () => {
  const { showToast } = useToast();
  const [vendors, setVendors] = useState<Vendor[]>(() =>
    db.getTable<Vendor>('vendors').filter((v) => !v.deleted_at && !(v as any).deletedAt)
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [deletingVendor, setDeletingVendor] = useState<Vendor | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [category, setCategory] = useState('plumbing');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [rating, setRating] = useState('5.0');

  const handleOpenAdd = () => {
    setEditingVendor(null);
    setName('');
    setCategory('plumbing');
    setPhone('');
    setEmail('');
    setNotes('');
    setRating('5.0');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (v: Vendor) => {
    setEditingVendor(v);
    setName(v.name);
    setCategory(v.category);
    setPhone(v.phone);
    setEmail(v.email);
    setNotes(v.notes || '');
    setRating(String(v.rating || '5.0'));
    setIsModalOpen(true);
  };

  const handleSaveVendor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast({ type: 'error', message: 'Vendor name is required!' });
      return;
    }
    if (!phone.trim()) {
      showToast({ type: 'error', message: 'Contact phone number is required!' });
      return;
    }

    if (editingVendor) {
      db.updateItem<Vendor>('vendors', editingVendor.id, {
        name: name.trim(),
        category,
        phone: phone.trim(),
        email: email.trim(),
        notes: notes.trim() || null,
        rating: parseFloat(rating) || 5.0,
      });
      showToast({ type: 'success', message: `Vendor "${name}" updated successfully` });
    } else {
      db.insertItem<Vendor>('vendors', {
        id: generateUUID(),
        org_id: 'org_demo_1',
        name: name.trim(),
        category,
        phone: phone.trim(),
        email: email.trim(),
        notes: notes.trim() || null,
        rating: parseFloat(rating) || 5.0,
      });
      showToast({ type: 'success', message: `Vendor "${name}" registered` });
    }

    setVendors(db.getTable<Vendor>('vendors').filter((v) => !v.deleted_at && !(v as any).deletedAt));
    setIsModalOpen(false);
  };

  const handleConfirmDelete = () => {
    if (!deletingVendor) return;
    const v = deletingVendor;
    db.softDeleteItem<Vendor>('vendors', v.id);
    setVendors(db.getTable<Vendor>('vendors').filter((item) => !item.deleted_at && !(item as any).deletedAt));
    setDeletingVendor(null);
    showToast({
      type: 'info',
      message: `Vendor "${v.name}" archived`,
      onUndo: () => {
        db.updateItem<Vendor>('vendors', v.id, { deleted_at: null });
        setVendors(db.getTable<Vendor>('vendors').filter((item) => !item.deleted_at && !(item as any).deletedAt));
        showToast({ type: 'success', message: `Restored vendor "${v.name}"` });
      },
    });
  };

  const filteredVendors = vendors.filter(
    (v) =>
      v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.phone.includes(searchQuery)
  );

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Contractors & Vendors Directory
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Approved maintenance trade specialists &bull; Emergency dispatches &bull; Service history
          </p>
        </div>
        <Button variant="primary" onClick={handleOpenAdd} className="gap-2">
          <Plus className="w-4 h-4" />
          <span>Register Vendor</span>
        </Button>
      </div>

      {/* Filter / Search Bar */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search contractors by trade or name..."
            className="w-full h-10 pl-10 pr-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
        </div>
        <Badge variant="accent">{filteredVendors.length} Verified Vendors</Badge>
      </div>

      {/* Vendor Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredVendors.length === 0 ? (
          <div className="col-span-full p-12 text-center text-xs text-[var(--text-secondary)] bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)]">
            <HardHat className="w-8 h-8 mx-auto mb-2 text-[var(--text-secondary)] opacity-50" />
            <span>No vendors match your search criteria.</span>
          </div>
        ) : (
          filteredVendors.map((v) => (
            <Card key={v.id} className="space-y-4 relative group">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-10 h-10 rounded-xl bg-[var(--accent-subtle)] text-[var(--accent)] flex items-center justify-center shrink-0">
                    <HardHat className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-bold text-[var(--text-primary)] tracking-tight truncate">
                      {v.name}
                    </h3>
                    <div className="flex items-center gap-1 text-[11px] text-amber-500 font-semibold mt-0.5">
                      <Star className="w-3.5 h-3.5 fill-amber-500 shrink-0" />
                      <span>{v.rating || 5.0} Rating</span>
                    </div>
                  </div>
                </div>
                <Badge variant="info" className="shrink-0">{v.category.replace('_', ' ').toUpperCase()}</Badge>
              </div>

              <div className="text-xs text-[var(--text-secondary)] space-y-2 pt-2 border-t border-[var(--border-subtle)] min-w-0">
                <p className="flex items-center gap-2.5 min-w-0">
                  <Phone className="w-3.5 h-3.5 text-[var(--text-secondary)] shrink-0" />
                  <span className="font-mono select-all truncate">{v.phone}</span>
                </p>
                <p className="flex items-center gap-2.5 min-w-0">
                  <Mail className="w-3.5 h-3.5 text-[var(--text-secondary)] shrink-0" />
                  <span className="select-all truncate">{v.email || '—'}</span>
                </p>
                {v.notes && (
                  <p className="flex items-start gap-2.5 text-[11px] text-[var(--text-secondary)] bg-[var(--bg-base)] p-2.5 rounded-xl border border-[var(--border-subtle)]">
                    <FileText className="w-3.5 h-3.5 text-[var(--text-secondary)] shrink-0 mt-0.5" />
                    <span className="line-clamp-2">{v.notes}</span>
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end pt-3 border-t border-[var(--border-subtle)]">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleOpenEdit(v)}
                    className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--bg-base)] transition-colors cursor-pointer"
                    title="Edit Vendor"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setDeletingVendor(v)}
                    className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--status-danger-fg)] hover:bg-[var(--bg-base)] transition-colors cursor-pointer"
                    title="Archive Vendor"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Modal: Create / Edit Vendor */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingVendor ? 'Edit Vendor Profile' : 'Register Service Contractor'}
        description="Maintain authorized trade contractors for assignment to unit maintenance requests."
        maxWidth="md"
      >
        <form onSubmit={handleSaveVendor} className="space-y-4">
          <Input
            label="Contractor / Company Name *"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Apex Plumbing & Drain Solutions"
            required
          />

          <Select
            label="Trade Category *"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="plumbing">Plumbing & Sewer</option>
            <option value="electrical">Electrical & Lighting</option>
            <option value="hvac">HVAC & Climate Control</option>
            <option value="appliance">Appliance Servicing</option>
            <option value="structural">Roofing & Structural</option>
            <option value="painting">Painting & Drywall</option>
            <option value="cleaning">Deep Cleaning & Turnover</option>
            <option value="locksmith">Locksmith & Security</option>
            <option value="other">General Handyman</option>
          </Select>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Phone Number *"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 555-0199"
              required
            />
            <Input
              label="Email Address *"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="service@apexplumbing.com"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              Contractor Notes & Rate Card
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Standard rate: $85/hr, 24/7 emergency availability, insured up to $2M"
              className="w-full p-2.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-[var(--border-subtle)]">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              {editingVendor ? 'Save Changes' : 'Register Vendor'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Delete Confirmation */}
      <Modal
        isOpen={!!deletingVendor}
        onClose={() => setDeletingVendor(null)}
        title="Archive Vendor Record?"
        maxWidth="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-secondary)]">
            Are you sure you want to archive <strong>{deletingVendor?.name}</strong>? Existing maintenance request histories will retain the contractor attribution.
          </p>
          <div className="flex justify-end gap-3 pt-3 border-t border-[var(--border-subtle)]">
            <Button variant="outline" onClick={() => setDeletingVendor(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleConfirmDelete}>
              Confirm Archive
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
