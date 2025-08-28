import React, { useEffect } from 'react';
import { ActionButtons } from './ActionButtons';

interface ActionButton {
  label: string;
  url: string;
}

interface ToastProps {
  message: string;
  type: 'warning' | 'error' | 'success' | 'info';
  isVisible: boolean;
  onClose: () => void;
  duration?: number;
  actions?: ActionButton[];
}

export const Toast: React.FC<ToastProps> = ({
  message,
  type,
  isVisible,
  onClose,
  duration = 200000,
  actions
}) => {
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => {
        onClose();
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [isVisible, onClose, duration]);

  if (!isVisible) return null;

  const getIcon = () => {
    switch (type) {
      case 'warning':
        return '⚠️';
      case 'error':
        return '❌';
      case 'success':
        return '✅';
      case 'info':
        return 'ℹ️';
      default:
        return 'ℹ️';
    }
  };

  const getToastClasses = () => {
    const baseClasses = 'fixed top-6 right-6 z-50 min-w-[320px] max-w-[500px] p-5 rounded-2xl shadow-2xl backdrop-blur-xl animate-slide-in border transition-all duration-300';
    
    switch (type) {
      case 'warning':
        return `${baseClasses} bg-amber-500/90 text-amber-100 border-amber-400/50 shadow-amber-500/25`;
      case 'error':
        return `${baseClasses} bg-red-500/90 text-red-100 border-red-400/50 shadow-red-500/25`;
      case 'success':
        return `${baseClasses} bg-green-500/90 text-green-100 border-green-400/50 shadow-green-500/25`;
      case 'info':
        return `${baseClasses} bg-blue-500/90 text-blue-100 border-blue-400/50 shadow-blue-500/25`;
      default:
        return `${baseClasses} bg-gray-700/90 text-gray-100 border-gray-600/50 shadow-gray-700/25`;
    }
  };

  return (
    <div className={`${getToastClasses()} lg:right-6 lg:left-auto left-6 lg:min-w-[320px] min-w-auto lg:max-w-[500px] max-w-none`}>
      <div className="flex items-start space-x-4">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-lg">
          {getIcon()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm leading-relaxed whitespace-pre-line">{message}</div>
          {actions && actions.length > 0 && (
            <ActionButtons actions={actions} className="mt-3" />
          )}
        </div>
        <button 
          className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors text-lg font-bold"
          onClick={onClose}
          aria-label="Close notification"
        >
          ×
        </button>
      </div>
    </div>
  );
};
