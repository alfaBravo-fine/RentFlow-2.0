import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Logo } from '../../components/Logo';
import { ShieldCheck, FileText, Lock, Database } from '../../components/icons';

export const SettingsAbout: React.FC = () => {
  const [isPrivacyPolicyOpen, setIsPrivacyPolicyOpen] = useState(false);
  const [isTermsOpen, setIsTermsOpen] = useState(false);

  return (
    <div className="space-y-6">
      <Card className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 pb-5 border-b border-[var(--border-subtle)]">
          <Logo size={56} className="shadow-md" />
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-bold tracking-tight text-[var(--text-primary)]">
                RentFlow Desktop
              </h2>
              <span className="text-xs font-mono tabular-nums text-[var(--text-secondary)]">
                v2.0.0
              </span>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              Local-First Property &amp; Rental Portfolio Suite · Tauri v2 · SQLite · Zero-Knowledge Backup
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-[var(--bg-surface-sunken)] border border-[var(--border-subtle)] space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
              <Database className="w-4 h-4 text-[var(--accent)]" />
              <span>Local SQLite Vault</span>
            </div>
            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
              Portfolio records live directly on your machine inside <code className="font-mono">rentflow.db</code> for instant offline access.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-[var(--bg-surface-sunken)] border border-[var(--border-subtle)] space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
              <Lock className="w-4 h-4 text-emerald-600" />
              <span>Encrypted Sync</span>
            </div>
            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
              Google Drive backups are encrypted client-side with Argon2id key derivation and AES-256-GCM.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-[var(--bg-surface-sunken)] border border-[var(--border-subtle)] space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
              <ShieldCheck className="w-4 h-4 text-[var(--accent)]" />
              <span>Zero Telemetry</span>
            </div>
            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
              No analytics trackers or third-party data harvesting. Only user-initiated Drive sync and OAuth requests.
            </p>
          </div>
        </div>
      </Card>

      <Card className="space-y-4">
        <CardHeader className="mb-2">
          <div>
            <CardTitle>Legal &amp; Documentation</CardTitle>
            <CardDescription>
              Review RentFlow&apos;s privacy guarantees and desktop software terms.
            </CardDescription>
          </div>
        </CardHeader>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsPrivacyPolicyOpen(true)}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Privacy Policy</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsTermsOpen(true)}
          >
            <FileText className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span>Terms of Service</span>
          </Button>
        </div>
      </Card>

      {/* Privacy Policy Modal */}
      <Modal
        isOpen={isPrivacyPolicyOpen}
        onClose={() => setIsPrivacyPolicyOpen(false)}
        title="RentFlow Privacy Policy"
        description="Local-first data architecture, native authentication, and zero-knowledge cloud backups."
        maxWidth="lg"
      >
        <div className="space-y-4 text-xs text-[var(--text-secondary)] leading-relaxed max-h-[65vh] overflow-y-auto pr-1">
          <div className="p-3.5 rounded-xl bg-[var(--bg-surface-sunken)] border border-[var(--border-subtle)] space-y-1.5">
            <h4 className="font-bold text-[var(--text-primary)]">1. Local-First Portfolio Storage</h4>
            <p>
              RentFlow stores your properties, units, tenant profiles, leases, invoices, payments, expenses,
              and documents strictly on your own computer in a local SQLite database (<code className="font-mono">rentflow.db</code>).
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-[var(--bg-surface-sunken)] border border-[var(--border-subtle)] space-y-1.5">
            <h4 className="font-bold text-[var(--text-primary)]">2. Native Google OAuth &amp; Token Isolation</h4>
            <p>
              Sign-in uses an RFC 7636 PKCE OAuth 2.0 loopback flow handled directly between the desktop
              application and Google&apos;s authorization servers. Tokens are stored locally in the app data directory.
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-[var(--bg-surface-sunken)] border border-[var(--border-subtle)] space-y-1.5">
            <h4 className="font-bold text-[var(--text-primary)]">3. Encrypted Google Drive Backups</h4>
            <p>
              When Drive synchronization is enabled, your database snapshot is compressed and encrypted
              client-side using Argon2id and AES-256-GCM before uploading to your private Google Drive backup folder.
            </p>
          </div>
          <div className="flex justify-end pt-3 border-t border-[var(--border-subtle)]">
            <Button variant="primary" size="sm" onClick={() => setIsPrivacyPolicyOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>

      {/* Terms of Service Modal */}
      <Modal
        isOpen={isTermsOpen}
        onClose={() => setIsTermsOpen(false)}
        title="RentFlow Terms of Service"
        description="Desktop software license, financial record disclaimers, and backup responsibility."
        maxWidth="lg"
      >
        <div className="space-y-4 text-xs text-[var(--text-secondary)] leading-relaxed max-h-[65vh] overflow-y-auto pr-1">
          <div className="p-3.5 rounded-xl bg-[var(--bg-surface-sunken)] border border-[var(--border-subtle)] space-y-1.5">
            <h4 className="font-bold text-[var(--text-primary)]">1. Ownership &amp; Control</h4>
            <p>
              You retain 100% ownership and control of every lease, accounting record, document, and backup created with RentFlow.
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-[var(--bg-surface-sunken)] border border-[var(--border-subtle)] space-y-1.5">
            <h4 className="font-bold text-[var(--text-primary)]">2. Accounting &amp; Legal Disclaimer</h4>
            <p>
              RentFlow provides property accounting ledgers and regional country-pack calculations as operational tools only and does not constitute legal or tax advice.
            </p>
          </div>
          <div className="flex justify-end pt-3 border-t border-[var(--border-subtle)]">
            <Button variant="primary" size="sm" onClick={() => setIsTermsOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
