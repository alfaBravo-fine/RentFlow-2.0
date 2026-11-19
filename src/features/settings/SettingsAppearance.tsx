import React from 'react';
import { motion } from 'motion/react';
import { Card, CardHeader, CardTitle, CardDescription } from '../../components/ui/Card';
import { Check, LayoutGrid, Palette, Sun, Moon, Sparkles } from '../../components/icons';
import { useToast } from '../../components/toast/ToastContext';
import { useTheme } from '../../components/theme/ThemeProvider';
import { THEME_PALETTES, ThemeMeta } from '../../stores/themeStore';
import { useUIStore, UILayout } from '../../stores/uiStore';

export const SettingsAppearance: React.FC = () => {
  const { showToast } = useToast();
  const { mode, colorPalette, setMode, setColorPalette } = useTheme();
  const { uiLayout, setUILayout } = useUIStore();

  const activePaletteMeta = THEME_PALETTES.find((p) => p.id === colorPalette);

  const handleSelectPalette = (palette: ThemeMeta) => {
    setColorPalette(palette.id);
    showToast({
      type: 'info',
      message: `Theme switched to ${palette.name} (${palette.accentLabel}).`,
    });
  };

  return (
    <div className="space-y-6">
      {/* Theme & Color Swatches */}
      <Card className="space-y-6">
        <CardHeader className="mb-2">
          <div>
            <div className="flex items-center gap-2">
              <Palette className="w-4 h-4 text-[var(--accent)]" />
              <CardTitle>Themes &amp; Color Swatches</CardTitle>
            </div>
            <CardDescription>
              Personalize surfaces, contrast, and accents with instant CSS variable switching.
            </CardDescription>
          </div>
          <span className="text-xs font-medium text-[var(--text-secondary)] capitalize whitespace-nowrap">
            {mode} Mode · {activePaletteMeta?.name || colorPalette}
          </span>
        </CardHeader>

        {/* Base Color Mode Toggle */}
        <div>
          <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-2">
            Base Luminance Mode
          </label>
          <div className="inline-flex p-1 rounded-xl bg-[var(--bg-surface-sunken)] border border-[var(--border-subtle)] gap-1">
            <button
              type="button"
              onClick={() => {
                setMode('light');
                showToast({ type: 'info', message: 'Switched to Light Mode.' });
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                mode === 'light'
                  ? 'bg-[var(--bg-surface-raised)] text-[var(--text-primary)] shadow-xs font-semibold'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Sun className="w-3.5 h-3.5 text-amber-500" />
              <span>Light</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('dark');
                showToast({ type: 'info', message: 'Switched to Dark Mode.' });
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                mode === 'dark'
                  ? 'bg-[var(--bg-surface-raised)] text-[var(--text-primary)] shadow-xs font-semibold'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Moon className="w-3.5 h-3.5 text-indigo-400" />
              <span>Dark</span>
            </button>
          </div>
        </div>

        {/* Swatch Grid */}
        <div className="space-y-3">
          <label className="block text-xs font-semibold text-[var(--text-secondary)]">
            Choose a Workspace Theme
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {THEME_PALETTES.map((palette) => {
              const isSelected = colorPalette === palette.id;
              const previewBg =
                palette.id === 'ethereal_glass' && mode === 'dark' ? '#0b101b' : palette.colors.bg;
              const previewSurface =
                palette.id === 'ethereal_glass' && mode === 'dark'
                  ? 'rgba(0, 0, 0, 0.45)'
                  : palette.colors.surface;
              const previewBorder =
                palette.id === 'ethereal_glass' && mode === 'dark'
                  ? 'rgba(255, 255, 255, 0.16)'
                  : palette.colors.border;

              return (
                <motion.button
                  key={palette.id}
                  type="button"
                  whileHover={{ scale: 1.015 }}
                  whileTap={{ scale: 0.985 }}
                  transition={{ type: 'spring', stiffness: 450, damping: 28 }}
                  onClick={() => handleSelectPalette(palette)}
                  className={`text-left p-3.5 rounded-2xl border transition-colors cursor-pointer space-y-3 relative overflow-hidden ${
                    isSelected
                      ? 'border-[var(--accent)] ring-2 ring-[var(--accent-glow)] bg-[var(--accent-subtle)]/35'
                      : 'border-[var(--border-subtle)] hover:border-[var(--border-strong)] bg-[var(--bg-surface-sunken)]'
                  }`}
                >
                  {/* Mini App Swatch Preview */}
                  <div
                    className="w-full h-14 rounded-xl border p-2 flex items-center gap-2 relative overflow-hidden"
                    style={{
                      backgroundColor: previewBg,
                      borderColor: previewBorder,
                    }}
                  >
                    {palette.isGlass && (
                      <div
                        className="absolute inset-0 pointer-events-none"
                        style={{
                          background:
                            'radial-gradient(circle at 20% 30%, rgba(99, 102, 241, 0.25), transparent 60%), radial-gradient(circle at 80% 70%, rgba(56, 189, 248, 0.22), transparent 55%)',
                        }}
                      />
                    )}
                    {/* Mini Sidebar */}
                    <div
                      className="w-6 h-full rounded-md border shrink-0 relative z-10"
                      style={{
                        backgroundColor: previewSurface,
                        borderColor: previewBorder,
                        backdropFilter: palette.isGlass ? 'blur(8px)' : undefined,
                      }}
                    />
                    {/* Mini Content */}
                    <div className="flex-1 h-full flex flex-col justify-between relative z-10">
                      <div
                        className="h-3 w-2/3 rounded-sm"
                        style={{
                          backgroundColor: previewSurface,
                          border: `1px solid ${previewBorder}`,
                        }}
                      />
                      <div className="flex items-center justify-between gap-1.5">
                        <div
                          className="h-2.5 flex-1 rounded-sm opacity-60"
                          style={{ backgroundColor: previewBorder }}
                        />
                        <div
                          className="h-3.5 w-8 rounded-sm shrink-0"
                          style={{ backgroundColor: palette.colors.accent }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Theme Name & Meta */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-[var(--text-primary)] truncate">
                          {palette.name}
                        </span>
                        {palette.isGlass && (
                          <Sparkles className="w-3 h-3 text-[var(--accent)] shrink-0" />
                        )}
                      </div>
                      <span className="text-[11px] text-[var(--text-secondary)] block truncate">
                        {palette.supportsBothModes ? 'Light & Dark' : `${palette.category === 'dark' ? 'Dark' : 'Light'} Mode`} · {palette.accentLabel}
                      </span>
                    </div>
                    {isSelected && (
                      <span className="w-5 h-5 rounded-full bg-[var(--accent)] text-white flex items-center justify-center shrink-0">
                        <Check className="w-3 h-3" />
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed line-clamp-2">
                    {palette.description}
                  </p>

                  {/* Circular Color Swatches */}
                  <div className="flex items-center gap-1.5 pt-0.5">
                    <span
                      className="w-5 h-5 rounded-full border border-black/15 dark:border-white/15 shrink-0"
                      style={{ backgroundColor: previewBg }}
                      title={`Background: ${previewBg}`}
                    />
                    <span
                      className="w-5 h-5 rounded-full border border-black/15 dark:border-white/15 shrink-0"
                      style={{ backgroundColor: previewSurface }}
                      title={`Card Surface: ${previewSurface}`}
                    />
                    <span
                      className="w-5 h-5 rounded-full border border-black/15 dark:border-white/15 shrink-0"
                      style={{ backgroundColor: palette.colors.accent }}
                      title={`Accent: ${palette.colors.accent}`}
                    />
                    <span className="text-[10px] font-mono tabular-nums text-[var(--text-subtle)] ml-auto">
                      {palette.colors.accent}
                    </span>
                  </div>
                </motion.button>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Workspace Navigation Layout */}
      <Card className="space-y-4">
        <CardHeader className="mb-2">
          <div>
            <div className="flex items-center gap-2">
              <LayoutGrid className="w-4 h-4 text-[var(--accent)]" />
              <CardTitle>Workspace Navigation Layout</CardTitle>
            </div>
            <CardDescription>
              Switch between the classic left sidebar and top-tabs workspace shell.
            </CardDescription>
          </div>
          <span className="text-xs font-medium text-[var(--accent)] whitespace-nowrap">
            {uiLayout === 'top-tabs' ? 'Top-Tabs Active' : 'Sidebar (Default)'}
          </span>
        </CardHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          <div
            onClick={() => {
              setUILayout('sidebar');
              showToast({ type: 'info', message: 'Switched to Sidebar Navigation (Default).' });
            }}
            className={`p-4 rounded-2xl border transition-all cursor-pointer ${
              uiLayout === 'sidebar'
                ? 'border-[var(--accent)] ring-2 ring-[var(--accent-glow)] bg-[var(--accent-subtle)]/25'
                : 'border-[var(--border-subtle)] hover:border-[var(--border-strong)] bg-[var(--bg-surface-sunken)]'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-[var(--text-primary)]">
                Sidebar Navigation (Default)
              </span>
              {uiLayout === 'sidebar' && <Check className="w-4 h-4 text-[var(--accent)]" />}
            </div>
            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
              Collapsible left rail with grouped sections, animated selection pill, and centered 1400px desktop canvas.
            </p>
          </div>

          <div
            onClick={() => {
              setUILayout('top-tabs');
              showToast({ type: 'info', message: 'Switched to Top-Tabs Navigation.' });
            }}
            className={`p-4 rounded-2xl border transition-all cursor-pointer ${
              uiLayout === 'top-tabs'
                ? 'border-[var(--accent)] ring-2 ring-[var(--accent-glow)] bg-[var(--accent-subtle)]/25'
                : 'border-[var(--border-subtle)] hover:border-[var(--border-strong)] bg-[var(--bg-surface-sunken)]'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-[var(--text-primary)]">
                Top Navigation (Top-Tabs)
              </span>
              {uiLayout === 'top-tabs' && <Check className="w-4 h-4 text-[var(--accent)]" />}
            </div>
            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
              Horizontal tab strip across the header for wide data tables and full-width financial ledgers.
            </p>
          </div>
        </div>

        <div className="max-w-xs pt-1">
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
            Active Layout Setting
          </label>
          <select
            value={uiLayout}
            onChange={(e) => {
              const next = e.target.value as UILayout;
              setUILayout(next);
              showToast({
                type: 'info',
                message: `Layout changed to ${next === 'top-tabs' ? 'Top-Tabs Navigation' : 'Sidebar Navigation'}.`,
              });
            }}
            className="w-full h-9 px-3 text-xs rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] focus-ring cursor-pointer"
          >
            <option value="sidebar">Sidebar Navigation (Default • Left Menu)</option>
            <option value="top-tabs">Top Navigation (Top-Tabs • Horizontal Bar)</option>
          </select>
        </div>
      </Card>
    </div>
  );
};
