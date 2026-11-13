import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Building2, ShieldCheck, Zap } from 'lucide-react';

interface SplashScreenProps {
  onFinish?: () => void;
  durationMs?: number;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
  onFinish,
  durationMs = 1500,
}) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const finishTimer = setTimeout(() => {
      setIsVisible(false);
      onFinish?.();
    }, durationMs);

    return () => {
      clearTimeout(finishTimer);
    };
  }, [durationMs, onFinish]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: 'easeInOut' }}
          className="fixed inset-0 z-[999999] flex flex-col items-center justify-center bg-slate-950 text-white select-none print:hidden"
        >
          <div className="absolute w-96 h-96 bg-blue-600/15 rounded-full blur-3xl animate-pulse" />
          <div className="absolute w-64 h-64 bg-indigo-500/10 rounded-full blur-2xl animate-pulse delay-300" />

          <div className="relative flex flex-col items-center space-y-6">
            <motion.div
              animate={{ scale: [1, 1.07, 1] }}
              transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
              className="relative flex items-center justify-center"
            >
              <div className="absolute w-24 h-24 rounded-2xl bg-blue-500/20 animate-ping opacity-75" />
              <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shadow-2xl shadow-blue-500/30 border border-blue-400/20">
                <Building2 className="w-10 h-10 text-white stroke-[2.2]" />
              </div>
            </motion.div>

            <div className="text-center space-y-1.5 z-10">
              <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                RentFlow Desktop
              </h1>
              <p className="text-xs font-medium text-blue-300/80 tracking-widest uppercase">
                Property Management Suite
              </p>
            </div>

            <div className="flex items-center gap-4 text-[11px] text-slate-400 pt-2 z-10">
              <span className="flex items-center gap-1.5 bg-slate-900/80 px-2.5 py-1 rounded-full border border-slate-800">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Native SQLite</span>
              </span>
              <span className="flex items-center gap-1.5 bg-slate-900/80 px-2.5 py-1 rounded-full border border-slate-800">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>Desktop Speed</span>
              </span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
