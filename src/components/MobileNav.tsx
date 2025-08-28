import React, { useState } from 'react';
import { UserProfile } from './UserProfile';

interface MobileNavProps {
  username: string;
  onUsernameChange: (newUsername: string) => void;
  onBluetoothMessage?: (message: string, type: 'warning' | 'error' | 'success' | 'info', actions?: Array<{ label: string; url: string }>) => void;
  messageCount?: number;
}

export const MobileNav: React.FC<MobileNavProps> = ({
  username,
  onUsernameChange,
  onBluetoothMessage,
  messageCount = 0
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const closeMenu = () => {
    setIsMenuOpen(false);
  };

  return (
    <>
      {/* Mobile Header */}
      <div className="bg-gray-800/95 backdrop-blur-sm border-b border-gray-700 p-4 shadow-lg flex items-center justify-between lg:hidden">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-400 to-secondary-500 flex items-center justify-center text-white text-sm font-bold uppercase">
            {username.charAt(0)}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">{username}</h2>
            <p className="text-xs text-gray-400">Online now</p>
          </div>
        </div>
        
        <button
          onClick={toggleMenu}
          className="p-2 rounded-lg bg-gray-700/50 hover:bg-gray-600/50 transition-colors duration-200 border border-gray-600/30"
          aria-label="Toggle menu"
        >
          <div className="w-6 h-6 flex flex-col justify-center items-center space-y-1">
            <div className={`w-4 h-0.5 bg-white transition-all duration-300 ${isMenuOpen ? 'rotate-45 translate-y-1' : ''}`}></div>
            <div className={`w-4 h-0.5 bg-white transition-all duration-300 ${isMenuOpen ? 'opacity-0' : ''}`}></div>
            <div className={`w-4 h-0.5 bg-white transition-all duration-300 ${isMenuOpen ? '-rotate-45 -translate-y-1' : ''}`}></div>
          </div>
        </button>
      </div>

      {/* Mobile Menu Overlay */}
      {isMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden"
          onClick={closeMenu}
        ></div>
      )}

      {/* Mobile Menu Drawer */}
      <div className={`fixed top-0 right-0 h-full w-80 max-w-[85vw] bg-gray-800/95 backdrop-blur-xl border-l border-gray-700 z-50 transform transition-transform duration-300 ease-in-out lg:hidden ${
        isMenuOpen ? 'translate-x-0' : 'translate-x-full'
      }`}>
        <div className="p-4 border-b border-gray-700">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-white">Menu</h3>
            <button
              onClick={closeMenu}
              className="p-2 rounded-lg bg-gray-700/50 hover:bg-gray-600/50 transition-colors duration-200"
              aria-label="Close menu"
            >
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        
        <div className="p-4 h-full overflow-y-auto">
          <UserProfile 
            username={username}
            onUsernameChange={onUsernameChange}
            onBluetoothMessage={onBluetoothMessage}
            messageCount={messageCount}
          />
          
          {/* Additional mobile menu items */}
          <div className="mt-6 pt-6 border-t border-gray-700">
            <div className="space-y-3">
              <button className="w-full p-3 text-left text-gray-300 hover:text-white hover:bg-gray-700/50 rounded-lg transition-colors duration-200 flex items-center space-x-3">
                <span className="text-lg">⚙️</span>
                <span>Settings</span>
              </button>
              
              <button className="w-full p-3 text-left text-gray-300 hover:text-white hover:bg-gray-700/50 rounded-lg transition-colors duration-200 flex items-center space-x-3">
                <span className="text-lg">🌙</span>
                <span>Dark Mode</span>
              </button>
              
              <button className="w-full p-3 text-left text-gray-300 hover:text-white hover:bg-gray-700/50 rounded-lg transition-colors duration-200 flex items-center space-x-3">
                <span className="text-lg">ℹ️</span>
                <span>About</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
