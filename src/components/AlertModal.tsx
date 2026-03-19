import React from 'react';
import { AlertCircle, X } from 'lucide-react';

interface AlertModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onClose: () => void;
  buttonText?: string;
}

export default function AlertModal({
  isOpen,
  title,
  message,
  onClose,
  buttonText = 'OK'
}: AlertModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
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
          <p className="text-zinc-300 mb-6">{message}</p>
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="px-6 py-2 rounded-xl font-medium bg-emerald-500 hover:bg-emerald-600 text-white transition-colors"
            >
              {buttonText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
