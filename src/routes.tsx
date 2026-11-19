import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { DashboardView } from './features/dashboard/DashboardView';
import { OnboardingView } from './features/onboarding/OnboardingView';
import { PropertiesView } from './features/properties/PropertiesView';
import { MapView } from './features/map/MapView';
import { TenantsView } from './features/tenants/TenantsView';
import { LeasesView } from './features/leases/LeasesView';
import { InvoicesView } from './features/invoices/InvoicesView';
import { MaintenanceView } from './features/maintenance/MaintenanceView';
import { UtilitySplitterView } from './features/utilities/UtilitySplitterView';
import { AreaCalculatorView } from './features/calculators/AreaCalculatorView';
import { VendorsView } from './features/vendors/VendorsView';
import { ExpensesView } from './features/expenses/ExpensesView';
import { ReportsView } from './features/reports/ReportsView';
import { DocumentsView } from './features/documents/DocumentsView';
import { OwnersView } from './features/owners/OwnersView';
import { SyncView } from './features/sync/SyncView';
import { SettingsView } from './features/settings/SettingsView';
import { SettingsGeneral } from './features/settings/SettingsGeneral';
import { SettingsAppearance } from './features/settings/SettingsAppearance';
import { SettingsData } from './features/settings/SettingsData';
import { SettingsAbout } from './features/settings/SettingsAbout';
import { CalendarView } from './features/calendar/CalendarView';

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<DashboardView />} />
      <Route path="/calendar" element={<CalendarView />} />
      <Route path="/onboarding" element={<OnboardingView />} />
      <Route path="/properties" element={<PropertiesView />} />
      <Route path="/map" element={<MapView />} />
      <Route path="/tenants" element={<TenantsView />} />
      <Route path="/leases" element={<LeasesView />} />
      <Route path="/invoices" element={<InvoicesView />} />
      <Route path="/maintenance" element={<MaintenanceView />} />
      <Route path="/utility-splitter" element={<UtilitySplitterView />} />
      <Route path="/area-calculator" element={<AreaCalculatorView />} />
      <Route path="/vendors" element={<VendorsView />} />
      <Route path="/expenses" element={<ExpensesView />} />
      <Route path="/documents" element={<DocumentsView />} />
      <Route path="/owners" element={<OwnersView />} />
      <Route path="/reports" element={<ReportsView />} />
      <Route path="/sync" element={<SyncView />} />
      <Route path="/settings" element={<SettingsView />}>
        <Route index element={<Navigate to="general" replace />} />
        <Route path="general" element={<SettingsGeneral />} />
        <Route path="appearance" element={<SettingsAppearance />} />
        <Route path="data" element={<SettingsData />} />
        <Route path="about" element={<SettingsAbout />} />
        <Route path="*" element={<Navigate to="general" replace />} />
      </Route>
      <Route path="*" element={<DashboardView />} />
    </Routes>
  );
};
