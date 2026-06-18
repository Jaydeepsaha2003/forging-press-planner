import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { ReactNode, useEffect } from 'react';

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  width = 560,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  width?: number;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-steel-950/50 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 4 }}
            transition={{ duration: 0.18 }}
            className="bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
            style={{ width: Math.min(width, 960) }}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="px-6 pt-5 pb-4 border-b border-steel-200 flex items-start justify-between">
              <div>
                {title && <h2 className="text-lg font-bold">{title}</h2>}
                {subtitle && <p className="text-sm text-steel-500 mt-1">{subtitle}</p>}
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-lg hover:bg-steel-100 flex items-center justify-center text-steel-500"
              >
                <X className="w-4 h-4" />
              </button>
            </header>
            <div className="flex-1 overflow-auto px-6 py-5">{children}</div>
            {footer && (
              <footer className="px-6 py-4 border-t border-steel-200 bg-steel-50 rounded-b-2xl flex items-center justify-end gap-2">
                {footer}
              </footer>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
