import React from 'react';
import { AlertCircle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface AlertModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onClose: () => void;
  buttonText?: string;
  children?: React.ReactNode;
}

export default function AlertModal({
  isOpen,
  title,
  message,
  onClose,
  buttonText = 'OK',
  children
}: AlertModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="relative bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl"
          >
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="bg-yellow-500/10 p-2 rounded-full">
                    <AlertCircle className="w-6 h-6 text-yellow-500" />
                  </div>
                  <h2 className="text-xl font-bold text-white">{title}</h2>
                </div>
                <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-zinc-300 mb-6 text-lg font-medium leading-relaxed">{message}</p>
              <div className="flex flex-col gap-3">
                {children ? children : (
                  <div className="flex justify-end">
                    <button
                      onClick={onClose}
                      className="px-6 py-2 rounded-xl font-medium bg-emerald-500 hover:bg-emerald-600 text-white transition-colors"
                    >
                      {buttonText}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
