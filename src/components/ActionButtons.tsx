import React from 'react';

interface ActionButton {
  label: string;
  url: string;
}

interface ActionButtonsProps {
  actions: ActionButton[];
  className?: string;
}

export const ActionButtons: React.FC<ActionButtonsProps> = ({ actions, className = '' }) => {
  const handleActionClick = (url: string) => {
    try {
      // Try to open the URL in the same tab for brave:// URLs
      if (url.startsWith('brave://')) {
        window.location.href = url;
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (error) {
      console.error('Failed to open URL:', error);
      // Fallback: copy URL to clipboard
      navigator.clipboard?.writeText(url).then(() => {
        alert(`URL copied to clipboard: ${url}`);
      }).catch(() => {
        alert(`Please navigate to: ${url}`);
      });
    }
  };

  return (
    <div className={`flex flex-col space-y-1.5 lg:space-y-2 mt-2 lg:mt-3 ${className}`}>
      {actions.map((action, index) => (
        <button
          key={index}
          onClick={() => handleActionClick(action.url)}
          className="px-3 lg:px-4 py-1.5 lg:py-2 bg-white/10 hover:bg-white/20 text-white text-xs lg:text-sm font-medium rounded-lg transition-all duration-200 border border-white/20 hover:border-white/30 flex items-center justify-center space-x-2"
        >
          <span className="truncate">{action.label}</span>
        </button>
      ))}
    </div>
  );
};
