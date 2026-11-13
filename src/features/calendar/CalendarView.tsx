import React, { useState, useMemo } from 'react';
import { db } from '../../db/client';
import { Lease, Invoice, MaintenanceRequest, Tenant, Unit, Property } from '../../db/schema';
import { usePack } from '../../countries/usePack';
import { formatMoney } from '../../lib/money';
import { generateUUID } from '../../lib/uuid';
import { useAppSettingsStore, CalendarTodoTask } from '../../stores/appSettingsStore';
import { useToast } from '../../components/toast/ToastContext';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Input';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  CheckCircle2,
  Circle,
  Plus,
  Trash2,
  AlertCircle,
  FileText,
  Wrench,
  Receipt,
  Users,
  CheckSquare,
} from '../../components/icons';

interface CalendarEvent {
  id: string;
  date: string; // YYYY-MM-DD
  type: 'lease_start' | 'lease_end' | 'invoice_due' | 'maintenance';
  title: string;
  description: string;
  statusBadge: string;
  urgency?: string;
  badgeVariant: 'success' | 'warning' | 'danger' | 'info' | 'accent';
}

interface TodoTask {
  id: string;
  title: string;
  priority: 'high' | 'medium' | 'normal';
  dueDate?: string;
  completed: boolean;
  category: 'lease' | 'inspection' | 'billing' | 'maintenance' | 'general';
}

export const CalendarView: React.FC = () => {
  const pack = usePack();
  const { showToast } = useToast();

  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDateStr, setSelectedDateStr] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );

  // Todo list state backed by centralized appSettingsStore
  const todos = useAppSettingsStore((s) => s.calendarTodos);
  const setCalendarTodos = useAppSettingsStore((s) => s.setCalendarTodos);

  const [newTodoTitle, setNewTodoTitle] = useState('');
  const [newTodoPriority, setNewTodoPriority] = useState<'high' | 'medium' | 'normal'>('medium');
  const [newTodoCategory, setNewTodoCategory] = useState<'lease' | 'inspection' | 'billing' | 'maintenance' | 'general'>('general');

  const saveTodos = (updated: CalendarTodoTask[]) => {
    setCalendarTodos(updated);
  };

  const handleAddTodo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTodoTitle.trim()) return;
    const item: TodoTask = {
      id: generateUUID(),
      title: newTodoTitle.trim(),
      priority: newTodoPriority,
      category: newTodoCategory,
      dueDate: selectedDateStr,
      completed: false,
    };
    const updated = [item, ...todos];
    saveTodos(updated);
    setNewTodoTitle('');
    showToast({ type: 'success', message: 'Task added to To-Do checklist' });
  };

  const handleToggleTodo = (id: string) => {
    const updated = todos.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t));
    saveTodos(updated);
  };

  const handleDeleteTodo = (id: string) => {
    const updated = todos.filter((t) => t.id !== id);
    saveTodos(updated);
  };

  // Queries
  const leases = db.getTable<Lease>('leases').filter((l) => !l.deleted_at && !(l as any).deletedAt);
  const invoices = db.getTable<Invoice>('invoices').filter((i) => !i.deleted_at && !(i as any).deletedAt);
  const maintenance = db.getTable<MaintenanceRequest>('maintenance_requests').filter((m) => !m.deleted_at && !(m as any).deletedAt);
  const tenants = db.getTable<Tenant>('tenants').filter((t) => !t.deleted_at && !(t as any).deletedAt);
  const units = db.getTable<Unit>('units').filter((u) => !u.deleted_at && !(u as any).deletedAt);
  const properties = db.getTable<Property>('properties').filter((p) => !p.deleted_at && !(p as any).deletedAt);

  const tenantMap = useMemo(() => new Map(tenants.map((t) => [t.id, t])), [tenants]);
  const unitMap = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);
  const propertyMap = useMemo(() => new Map(properties.map((p) => [p.id, p])), [properties]);
  const leaseMap = useMemo(() => new Map(leases.map((l) => [l.id, l])), [leases]);

  // Aggregate all events
  const allEvents = useMemo<CalendarEvent[]>(() => {
    const evts: CalendarEvent[] = [];

    // 1. Lease Starts & Expirations
    leases.forEach((l) => {
      const tenant = tenantMap.get(l.tenant_id);
      const unit = unitMap.get(l.unit_id);
      const prop = unit ? propertyMap.get(unit.property_id) : undefined;
      const unitName = unit ? `${prop ? prop.name + ' - ' : ''}${unit.name}` : 'Unit';

      if (l.start_date) {
        evts.push({
          id: `lease-start-${l.id}`,
          date: l.start_date,
          type: 'lease_start',
          title: `Lease Commencing: ${tenant?.name || 'Tenant'}`,
          description: `Contract starts for ${unitName} (${formatMoney(l.rent_minor, pack)}/mo)`,
          statusBadge: 'Move-In',
          badgeVariant: 'success',
        });
      }

      if (l.end_date) {
        evts.push({
          id: `lease-end-${l.id}`,
          date: l.end_date,
          type: 'lease_end',
          title: `Lease Expiring: ${tenant?.name || 'Tenant'}`,
          description: `Tenancy conclusion for ${unitName}. Move-out & deposit return review.`,
          statusBadge: 'Renewal / Move-Out',
          badgeVariant: 'warning',
        });
      }
    });

    // 2. Invoice Due Dates
    invoices.forEach((inv) => {
      if (!inv.due_date) return;
      const lease = leaseMap.get(inv.lease_id);
      const tenant = lease ? tenantMap.get(lease.tenant_id) : undefined;

      const isOverdue = inv.status === 'overdue' || (new Date(inv.due_date).getTime() < Date.now() && inv.status !== 'paid');

      evts.push({
        id: `invoice-${inv.id}`,
        date: inv.due_date,
        type: 'invoice_due',
        title: `Rent Due: ${tenant?.name || 'Tenant'}`,
        description: `Invoice #${inv.id.slice(-6)}: ${formatMoney(inv.total_minor, pack)} (${inv.status.toUpperCase()})`,
        statusBadge: isOverdue ? 'Overdue' : inv.status.toUpperCase(),
        badgeVariant: isOverdue ? 'danger' : 'info',
      });
    });

    // 3. Maintenance Requests / Visits
    maintenance.forEach((m) => {
      const unit = unitMap.get(m.unit_id);
      const prop = unit ? propertyMap.get(unit.property_id) : undefined;
      const dateStr = (m.completed_at ? m.completed_at.slice(0, 10) : new Date(m.updated_at || Date.now()).toISOString().slice(0, 10));

      evts.push({
        id: `maint-${m.id}`,
        date: dateStr,
        type: 'maintenance',
        title: `Work Order: ${m.category.toUpperCase()}`,
        description: `${m.description} (${unit?.name || 'General'}${prop ? ', ' + prop.name : ''})`,
        statusBadge: m.status.toUpperCase(),
        urgency: m.urgency,
        badgeVariant: m.urgency === 'emergency' || m.urgency === 'high' ? 'danger' : 'accent',
      });
    });

    return evts;
  }, [leases, invoices, maintenance, tenantMap, unitMap, propertyMap, leaseMap, pack]);

  // Calendar calculations
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = new Date(year, month, 1).getDay();

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleToday = () => {
    const now = new Date();
    setCurrentDate(now);
    setSelectedDateStr(now.toISOString().slice(0, 10));
  };

  // Events filtered for selected date
  const eventsForSelectedDate = allEvents.filter((e) => e.date === selectedDateStr);

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Unified Portfolio Calendar & Task Hub
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Aggregated timeline &bull; Lease cycles &bull; Invoice payment due dates &bull; Maintenance work orders ({pack.name} Pack)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleToday}>
            Today
          </Button>
          <div className="flex items-center gap-1 border border-[var(--border-strong)] rounded-xl bg-[var(--bg-surface)] p-0.5">
            <button
              onClick={handlePrevMonth}
              className="p-1.5 rounded-lg hover:bg-[var(--bg-base)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 text-xs font-bold text-[var(--text-primary)] min-w-[120px] text-center">
              {monthNames[month]} {year}
            </span>
            <button
              onClick={handleNextMonth}
              className="p-1.5 rounded-lg hover:bg-[var(--bg-base)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Interactive Calendar Grid */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-4 sm:p-6 space-y-4">
            {/* Days of Week Header */}
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider pb-2 border-b border-[var(--border-subtle)]">
              <span>Sun</span>
              <span>Mon</span>
              <span>Tue</span>
              <span>Wed</span>
              <span>Thu</span>
              <span>Fri</span>
              <span>Sat</span>
            </div>

            {/* Calendar Cells */}
            <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
              {/* Blank empty cells before first day */}
              {Array.from({ length: firstDayIndex }).map((_, i) => (
                <div key={`blank-${i}`} className="min-h-[75px] sm:min-h-[85px] p-1 bg-transparent rounded-xl opacity-30" />
              ))}

              {/* Month Day Cells */}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const dayNum = i + 1;
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                const isSelected = selectedDateStr === dateStr;
                const isToday = new Date().toISOString().slice(0, 10) === dateStr;
                const dayEvents = allEvents.filter((e) => e.date === dateStr);

                return (
                  <div
                    key={`day-${dayNum}`}
                    onClick={() => setSelectedDateStr(dateStr)}
                    className={`min-h-[75px] sm:min-h-[85px] p-1.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'border-[var(--accent)] bg-[var(--accent-subtle)]/30 ring-2 ring-[var(--accent)]'
                        : isToday
                        ? 'border-indigo-400/50 bg-[var(--bg-surface-raised)]'
                        : 'border-[var(--border-subtle)] hover:border-[var(--border-strong)] bg-[var(--bg-surface)]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center ${
                          isToday
                            ? 'bg-[var(--accent)] text-white'
                            : isSelected
                            ? 'text-[var(--accent)] font-extrabold'
                            : 'text-[var(--text-primary)]'
                        }`}
                      >
                        {dayNum}
                      </span>
                      {dayEvents.length > 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-indigo-500/10 text-[var(--accent)]">
                          {dayEvents.length}
                        </span>
                      )}
                    </div>

                    {/* Compact Event Pills in Grid */}
                    <div className="space-y-1 mt-1 overflow-hidden">
                      {dayEvents.slice(0, 2).map((ev) => (
                        <div
                          key={ev.id}
                          className={`truncate text-[10px] font-medium px-1.5 py-0.5 rounded ${
                            ev.type === 'lease_start'
                              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                              : ev.type === 'lease_end'
                              ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                              : ev.type === 'invoice_due'
                              ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                              : 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300'
                          }`}
                        >
                          {ev.title}
                        </div>
                      ))}
                      {dayEvents.length > 2 && (
                        <div className="text-[9px] text-[var(--text-secondary)] font-semibold pl-1">
                          +{dayEvents.length - 2} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Agenda of Events for Selected Date */}
          <Card className="space-y-4">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CalendarIcon className="w-4 h-4 text-[var(--accent)]" />
                <CardTitle>Schedule for {new Date(selectedDateStr + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</CardTitle>
              </div>
              <Badge variant="neutral">{eventsForSelectedDate.length} Event{eventsForSelectedDate.length === 1 ? '' : 's'}</Badge>
            </CardHeader>

            {eventsForSelectedDate.length === 0 ? (
              <p className="text-xs text-[var(--text-secondary)] py-4 text-center">
                No lease transitions, invoice deadlines, or maintenance tasks scheduled on this date.
              </p>
            ) : (
              <div className="space-y-2.5">
                {eventsForSelectedDate.map((ev) => (
                  <div
                    key={ev.id}
                    className="p-3 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)] flex items-start justify-between gap-3"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-strong)] flex items-center justify-center shrink-0 mt-0.5">
                        {ev.type === 'lease_start' || ev.type === 'lease_end' ? (
                          <FileText className="w-4 h-4 text-emerald-600" />
                        ) : ev.type === 'invoice_due' ? (
                          <Receipt className="w-4 h-4 text-rose-600" />
                        ) : (
                          <Wrench className="w-4 h-4 text-indigo-600" />
                        )}
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-[var(--text-primary)]">
                          {ev.title}
                        </h4>
                        <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                          {ev.description}
                        </p>
                      </div>
                    </div>
                    <Badge variant={ev.badgeVariant} size="sm">
                      {ev.statusBadge}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right 1 Col: To-Do Checklist */}
        <div className="space-y-4">
          <Card className="space-y-4">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-emerald-600" />
                <CardTitle>Portfolio To-Do Checklist</CardTitle>
              </div>
              <Badge variant="success">
                {todos.filter((t) => !t.completed).length} Pending
              </Badge>
            </CardHeader>

            {/* Quick Add Form */}
            <form onSubmit={handleAddTodo} className="space-y-2.5 p-3 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)]">
              <Input
                type="text"
                placeholder="Add a new checklist task..."
                value={newTodoTitle}
                onChange={(e) => setNewTodoTitle(e.target.value)}
                className="w-full text-xs h-8"
                required
              />
              <div className="flex items-center gap-2">
                <Select
                  value={newTodoPriority}
                  onChange={(e) => setNewTodoPriority(e.target.value as any)}
                  className="text-xs h-7 flex-1"
                >
                  <option value="normal">Normal Priority</option>
                  <option value="medium">Medium Priority</option>
                  <option value="high">High Priority</option>
                </Select>
                <Select
                  value={newTodoCategory}
                  onChange={(e) => setNewTodoCategory(e.target.value as any)}
                  className="text-xs h-7 flex-1"
                >
                  <option value="general">General</option>
                  <option value="lease">Lease</option>
                  <option value="inspection">Inspection</option>
                  <option value="billing">Billing</option>
                  <option value="maintenance">Maintenance</option>
                </Select>
                <Button type="submit" size="sm" variant="primary" className="h-7 px-2.5">
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add</span>
                </Button>
              </div>
            </form>

            {/* Task Items List */}
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {todos.length === 0 ? (
                <p className="text-xs text-[var(--text-secondary)] text-center py-6">
                  Checklist is completely clear!
                </p>
              ) : (
                todos.map((todo) => (
                  <div
                    key={todo.id}
                    className={`p-3 rounded-xl border transition-all flex items-start justify-between gap-2.5 ${
                      todo.completed
                        ? 'bg-[var(--bg-surface-sunken)] border-[var(--border-subtle)] opacity-70'
                        : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
                    }`}
                  >
                    <div className="flex items-start gap-2.5 flex-1 min-w-0">
                      <button
                        type="button"
                        onClick={() => handleToggleTodo(todo.id)}
                        className="mt-0.5 shrink-0 text-[var(--text-secondary)] hover:text-emerald-600 transition-colors cursor-pointer"
                      >
                        {todo.completed ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <Circle className="w-4 h-4" />
                        )}
                      </button>
                      <div className="min-w-0 flex-1">
                        <span
                          className={`text-xs block leading-tight font-medium ${
                            todo.completed
                              ? 'line-through text-[var(--text-secondary)]'
                              : 'text-[var(--text-primary)]'
                          }`}
                        >
                          {todo.title}
                        </span>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase ${
                              todo.priority === 'high'
                                ? 'bg-rose-500/10 text-rose-600'
                                : todo.priority === 'medium'
                                ? 'bg-amber-500/10 text-amber-600'
                                : 'bg-gray-500/10 text-gray-600'
                            }`}
                          >
                            {todo.priority}
                          </span>
                          <span className="text-[10px] text-[var(--text-secondary)] capitalize font-mono">
                            {todo.category}
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteTodo(todo.id)}
                      className="text-[var(--text-subtle)] hover:text-rose-600 p-1 rounded transition-colors cursor-pointer"
                      title="Delete task"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
