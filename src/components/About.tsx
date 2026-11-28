import React, { useState } from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { Logo } from './Logo';
import { ShieldCheck, FileText } from './icons';

export const About: React.FC = () => {
  const [isPrivacyPolicyOpen, setIsPrivacyPolicyOpen] = useState(false);
  const [isTermsOpen, setIsTermsOpen] = useState(false);

  return (
    <div className="space-y-6">
      <Card className="p-8 sm:p-10 text-center space-y-8">
        {/* Centered Brand Mark */}
        <div className="flex flex-col items-center space-y-3">
          <Logo size={68} className="shadow-md" />
          <div className="space-y-1">
            <h2 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
              RentFlow Desktop
            </h2>
            <p className="text-xs font-mono tabular-nums text-[var(--text-secondary)]">
              Version 2.0.1
            </p>
          </div>
        </div>

        {/* About RentFlow */}
        <div className="max-w-xl mx-auto space-y-2.5 pt-6 border-t border-[var(--border-subtle)]">
          <h3 className="text-base font-bold tracking-tight text-[var(--text-primary)]">
            About RentFlow
          </h3>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            RentFlow is a premium, offline-first property management desktop application designed to make rent collection, lease tracking, and maintenance effortless.
          </p>
        </div>

        {/* About the Developer */}
        <div className="max-w-xl mx-auto space-y-2.5 pt-6 border-t border-[var(--border-subtle)]">
          <h3 className="text-base font-bold tracking-tight text-[var(--text-primary)]">
            About the Developer
          </h3>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            Built by Shaheer Ahmad, a passionate software developer from Pakistan. RentFlow was created to solve the real-world struggles of landlords and property managers, replacing messy spreadsheets with a fast, secure, and beautiful desktop experience.
          </p>
        </div>

        {/* Documentation & Legal Actions */}
        <div className="flex flex-wrap items-center justify-center gap-3 pt-6 border-t border-[var(--border-subtle)]">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsPrivacyPolicyOpen(true)}
            className="whitespace-nowrap"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Privacy Policy</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsTermsOpen(true)}
            className="whitespace-nowrap"
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
              and documents directly on your computer in a private local database.
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-[var(--bg-surface-sunken)] border border-[var(--border-subtle)] space-y-1.5">
            <h4 className="font-bold text-[var(--text-primary)]">2. Secure Google Sign-In</h4>
            <p>
              When Cloud Backup is enabled, authentication uses official Google sign-in handled securely by the desktop application. Credentials remain stored locally inside your application data folder.
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-[var(--bg-surface-sunken)] border border-[var(--border-subtle)] space-y-1.5">
            <h4 className="font-bold text-[var(--text-primary)]">3. Encrypted Google Drive Backups</h4>
            <p>
              Portfolio snapshots are encrypted on your machine using AES-256 encryption before being uploaded to your
              visible <code className="font-mono">RentFlow Grouped Backups</code> Google Drive folder.
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

export default About;
