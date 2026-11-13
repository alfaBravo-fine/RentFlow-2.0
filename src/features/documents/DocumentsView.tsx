import React, { useState } from 'react';
import { db } from '../../db/client';
import { DocumentVaultItem, Property, Tenant, Lease } from '../../db/schema';
import { generateUUID } from '../../lib/uuid';
import { useToast } from '../../components/toast/ToastContext';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import {
  FileText,
  Plus,
  Calendar,
  AlertCircle,
  Paperclip,
  Trash2,
  Pencil,
  Search,
  Download,
  Eye,
  ShieldCheck,
  Building2,
  Users,
} from '../../components/icons';

export const DocumentsView: React.FC = () => {
  const { showToast } = useToast();
  const [documents, setDocuments] = useState<DocumentVaultItem[]>(() =>
    db.getTable<DocumentVaultItem>('documents').filter((d) => !d.deleted_at && !(d as any).deletedAt)
  );
  const properties = db.getTable<Property>('properties').filter((p) => !p.deleted_at && !(p as any).deletedAt);
  const tenants = db.getTable<Tenant>('tenants').filter((t) => !t.deleted_at && !(t as any).deletedAt);

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<DocumentVaultItem | null>(null);
  const [deletingDoc, setDeletingDoc] = useState<DocumentVaultItem | null>(null);
  const [previewDoc, setPreviewDoc] = useState<DocumentVaultItem | null>(null);

  // Form states
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<DocumentVaultItem['category']>('lease_agreement');
  const [relatedEntityType, setRelatedEntityType] = useState<'property' | 'tenant' | 'lease' | 'other'>('property');
  const [relatedEntityId, setRelatedEntityId] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileData, setFileData] = useState('');
  const [fileSize, setFileSize] = useState(0);
  const [notes, setNotes] = useState('');

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  const handleOpenAdd = () => {
    setEditingDoc(null);
    setTitle('');
    setCategory('lease_agreement');
    setRelatedEntityType('property');
    setRelatedEntityId(properties[0]?.id || '');
    setExpiryDate('');
    setFileName('');
    setFileData('');
    setFileSize(0);
    setNotes('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (doc: DocumentVaultItem) => {
    setEditingDoc(doc);
    setTitle(doc.title);
    setCategory(doc.category);
    setRelatedEntityType((doc.related_entity_type as any) || 'property');
    setRelatedEntityId(doc.related_entity_id || '');
    setExpiryDate(doc.expiry_date || '');
    setFileName(doc.file_name);
    setFileData(doc.file_data_or_url);
    setFileSize(doc.file_size_bytes || 0);
    setNotes(doc.notes || '');
    setIsModalOpen(true);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setFileSize(file.size);

    const reader = new FileReader();
    reader.onload = () => {
      setFileData(reader.result as string);
      showToast({ type: 'success', message: `Attached file: ${file.name}` });
    };
    reader.readAsDataURL(file);
  };

  const handleSaveDoc = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      showToast({ type: 'error', message: 'Document title is required!' });
      return;
    }

    if (editingDoc) {
      db.updateItem<DocumentVaultItem>('documents', editingDoc.id, {
        title: title.trim(),
        category,
        related_entity_type: relatedEntityType as any,
        related_entity_id: relatedEntityId || null,
        expiry_date: expiryDate || null,
        file_name: fileName || editingDoc.file_name,
        file_data_or_url: fileData || editingDoc.file_data_or_url,
        file_size_bytes: fileSize || editingDoc.file_size_bytes,
        notes: notes.trim() || null,
      });
      showToast({ type: 'success', message: `Document "${title}" updated` });
    } else {
      db.insertItem<DocumentVaultItem>('documents', {
        id: generateUUID(),
        org_id: 'org_demo_1',
        title: title.trim(),
        category,
        related_entity_type: relatedEntityType as any,
        related_entity_id: relatedEntityId || null,
        expiry_date: expiryDate || null,
        file_name: fileName || 'Document.pdf',
        file_data_or_url: fileData || 'data:application/pdf;base64,...',
        file_size_bytes: fileSize || 1024,
        notes: notes.trim() || null,
      });
      showToast({ type: 'success', message: `Document "${title}" stored in vault` });
    }

    setDocuments(db.getTable<DocumentVaultItem>('documents').filter((d) => !d.deleted_at && !(d as any).deletedAt));
    setIsModalOpen(false);
  };

  const handleConfirmDelete = () => {
    if (!deletingDoc) return;
    const d = deletingDoc;
    db.softDeleteItem<DocumentVaultItem>('documents', d.id);
    setDocuments(db.getTable<DocumentVaultItem>('documents').filter((item) => !item.deleted_at && !(item as any).deletedAt));
    setDeletingDoc(null);
    showToast({
      type: 'info',
      message: `Document "${d.title}" archived`,
      onUndo: () => {
        db.updateItem<DocumentVaultItem>('documents', d.id, { deleted_at: null });
        setDocuments(db.getTable<DocumentVaultItem>('documents').filter((item) => !item.deleted_at && !(item as any).deletedAt));
        showToast({ type: 'success', message: `Restored document "${d.title}"` });
      },
    });
  };

  const filteredDocs = documents.filter((d) => {
    const matchesSearch =
      d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (d.notes && d.notes.toLowerCase().includes(searchQuery.toLowerCase())) ||
      d.file_name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || d.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Document Vault & Expiry Compliance
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Store lease contracts, tenant identity cards, insurance deeds, and track statutory expiry dates
          </p>
        </div>
        <Button variant="primary" onClick={handleOpenAdd} className="gap-2">
          <Plus className="w-4 h-4" />
          <span>Upload Document</span>
        </Button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search documents by title or filename..."
            className="w-full h-9 pl-10 pr-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="h-9 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] focus:outline-none"
          >
            <option value="all">All Categories</option>
            <option value="lease_agreement">Lease Agreements</option>
            <option value="tenant_id">Tenant IDs & Passports</option>
            <option value="insurance_policy">Insurance Policies</option>
            <option value="property_deed">Property Deeds & Titles</option>
            <option value="inspection_report">Inspection Reports</option>
            <option value="tax_certificate">Tax Certificates</option>
            <option value="other">Other Documents</option>
          </select>
          <Badge variant="accent">{filteredDocs.length} Documents</Badge>
        </div>
      </div>

      {/* Document Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredDocs.length === 0 ? (
          <div className="col-span-full p-12 text-center text-xs text-[var(--text-secondary)] bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)]">
            <FileText className="w-8 h-8 mx-auto mb-2 text-[var(--text-secondary)] opacity-50" />
            <span>No documents found matching criteria.</span>
          </div>
        ) : (
          filteredDocs.map((doc) => {
            let daysUntilExpiry: number | null = null;
            let isExpired = false;
            let isExpiringSoon = false;

            if (doc.expiry_date) {
              const diffMs = new Date(doc.expiry_date).getTime() - now;
              daysUntilExpiry = Math.ceil(diffMs / dayMs);
              isExpired = daysUntilExpiry <= 0;
              isExpiringSoon = daysUntilExpiry > 0 && daysUntilExpiry <= 30;
            }

            const relatedProperty = properties.find((p) => p.id === doc.related_entity_id);
            const relatedTenant = tenants.find((t) => t.id === doc.related_entity_id);

            return (
              <Card key={doc.id} className="space-y-4 relative group">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-xl bg-[var(--accent-subtle)] text-[var(--accent)] flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold text-[var(--text-primary)] truncate">
                        {doc.title}
                      </h3>
                      <span className="text-[11px] text-[var(--text-secondary)] block truncate">
                        {doc.file_name}
                      </span>
                    </div>
                  </div>
                  <Badge variant="info" className="shrink-0">{doc.category.replace('_', ' ').toUpperCase()}</Badge>
                </div>

                {/* Expiry Pill */}
                {doc.expiry_date ? (
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)] text-xs">
                    <span className="text-[var(--text-secondary)] flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>Expires: <strong>{doc.expiry_date}</strong></span>
                    </span>
                    {isExpired ? (
                      <Badge variant="danger">Expired</Badge>
                    ) : isExpiringSoon ? (
                      <Badge variant="warning">{daysUntilExpiry}d Left</Badge>
                    ) : (
                      <Badge variant="success">Valid ({daysUntilExpiry}d)</Badge>
                    )}
                  </div>
                ) : (
                  <div className="text-[11px] text-[var(--text-secondary)] italic">
                    No expiration date specified (Indefinite)
                  </div>
                )}

                {/* Attribution info */}
                <div className="text-xs text-[var(--text-secondary)] space-y-1 pt-2 border-t border-[var(--border-subtle)]">
                  {relatedProperty && (
                    <p className="flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-[var(--text-subtle)]" />
                      <span>Property: <strong>{relatedProperty.name}</strong></span>
                    </p>
                  )}
                  {relatedTenant && (
                    <p className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-[var(--text-subtle)]" />
                      <span>Resident: <strong>{relatedTenant.name}</strong></span>
                    </p>
                  )}
                  {doc.notes && (
                    <p className="text-[11px] text-[var(--text-secondary)] line-clamp-2 mt-1">
                      {doc.notes}
                    </p>
                  )}
                </div>

                {/* Card Action footer */}
                <div className="flex items-center justify-between pt-3 border-t border-[var(--border-subtle)]">
                  <button
                    onClick={() => setPreviewDoc(doc)}
                    className="text-xs font-semibold text-[var(--accent)] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Preview</span>
                  </button>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleOpenEdit(doc)}
                      className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--bg-base)] transition-colors cursor-pointer"
                      title="Edit"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeletingDoc(doc)}
                      className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--status-danger-fg)] hover:bg-[var(--bg-base)] transition-colors cursor-pointer"
                      title="Archive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>

      {/* Modal: Upload / Edit Document */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingDoc ? 'Edit Document Details' : 'Store Document in Vault'}
        description="Encrypted offline local storage with statutory expiration monitoring."
        maxWidth="lg"
      >
        <form onSubmit={handleSaveDoc} className="space-y-4">
          <Input
            label="Document Title *"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Commercial Lease Contract 2026-2027"
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Document Classification *"
              value={category}
              onChange={(e) => setCategory(e.target.value as any)}
              required
            >
              <option value="lease_agreement">Lease Agreement</option>
              <option value="tenant_id">Tenant ID / Passport</option>
              <option value="insurance_policy">Insurance Policy</option>
              <option value="property_deed">Property Title / Deed</option>
              <option value="inspection_report">Inspection Certificate</option>
              <option value="tax_certificate">Tax Assessment Certificate</option>
              <option value="utility_bill">Master Utility Document</option>
              <option value="other">General Document</option>
            </Select>

            <Input
              label="Statutory Expiration Date (Optional)"
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Relates to Entity Type"
              value={relatedEntityType}
              onChange={(e) => setRelatedEntityType(e.target.value as any)}
            >
              <option value="property">Property</option>
              <option value="tenant">Tenant</option>
              <option value="other">General / Org Wide</option>
            </Select>

            {relatedEntityType === 'property' ? (
              <Select
                label="Assign Property"
                value={relatedEntityId}
                onChange={(e) => setRelatedEntityId(e.target.value)}
              >
                <option value="">Select Property</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            ) : relatedEntityType === 'tenant' ? (
              <Select
                label="Assign Resident"
                value={relatedEntityId}
                onChange={(e) => setRelatedEntityId(e.target.value)}
              >
                <option value="">Select Resident</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            ) : null}
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              File Attachment (PDF, Image, or Doc)
            </label>
            <input
              type="file"
              onChange={handleFileUpload}
              className="w-full text-xs text-[var(--text-secondary)] file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-[var(--accent-subtle)] file:text-[var(--accent)] hover:file:bg-[var(--accent)]/20 cursor-pointer"
            />
            {fileName && (
              <p className="text-[11px] text-emerald-600 mt-1">
                Selected: <strong>{fileName}</strong> ({(fileSize / 1024).toFixed(1)} KB)
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              Notes & Compliance Checklist
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Original signed copy kept in office fire safe #3, requires 60-day renewal notice..."
              className="w-full p-2.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-[var(--border-subtle)]">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              {editingDoc ? 'Save Changes' : 'Store Document'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Preview Document */}
      <Modal
        isOpen={!!previewDoc}
        onClose={() => setPreviewDoc(null)}
        title={previewDoc?.title || 'Document Preview'}
        maxWidth="md"
      >
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)] space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--text-secondary)]">File Name:</span>
              <span className="font-mono font-semibold text-[var(--text-primary)]">
                {previewDoc?.file_name}
              </span>
            </div>
            {previewDoc?.expiry_date && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-secondary)]">Expiry Date:</span>
                <span className="font-mono font-semibold text-rose-600">
                  {previewDoc?.expiry_date}
                </span>
              </div>
            )}
          </div>

          {previewDoc?.file_data_or_url?.startsWith('data:image') ? (
            <img
              src={previewDoc.file_data_or_url}
              alt="Preview"
              className="max-h-96 w-full object-contain rounded-xl border border-[var(--border-subtle)]"
            />
          ) : (
            <div className="p-8 text-center text-xs text-[var(--text-secondary)] bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)]">
              <Paperclip className="w-8 h-8 mx-auto mb-2 text-[var(--accent)]" />
              <span>Digital document record verified in local secure storage.</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
            <Button variant="outline" onClick={() => setPreviewDoc(null)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Archive Confirmation */}
      <Modal
        isOpen={!!deletingDoc}
        onClose={() => setDeletingDoc(null)}
        title="Archive Document Record?"
        maxWidth="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-secondary)]">
            Are you sure you want to archive <strong>{deletingDoc?.title}</strong>? You can restore it anytime using the undo toast.
          </p>
          <div className="flex justify-end gap-3 pt-3 border-t border-[var(--border-subtle)]">
            <Button variant="outline" onClick={() => setDeletingDoc(null)}>
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
