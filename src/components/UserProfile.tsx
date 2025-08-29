import React, { useState, useEffect } from 'react';
import { requestBluetoothPermission, checkBluetoothCompatibility, promptBraveBluetoothSetup, getBrowserInfo, isBluetoothReady } from '../utils/bluetooth';

interface UserProfileProps {
  username: string;
  onUsernameChange: (newUsername: string) => void;
  onBluetoothMessage?: (message: string, type: 'warning' | 'error' | 'success' | 'info', actions?: Array<{ label: string; url: string }>) => void;
  messageCount?: number;
}

export const UserProfile: React.FC<UserProfileProps> = ({
  username,
  onUsernameChange,
  onBluetoothMessage,
  messageCount = 0
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editUsername, setEditUsername] = useState(username);
  const [isTestingBluetooth, setIsTestingBluetooth] = useState(false);
  const [bluetoothReady, setBluetoothReady] = useState<boolean | null>(null);

  // Check Bluetooth readiness on component mount
  useEffect(() => {
    const checkBluetoothReadiness = async () => {
      const ready = await isBluetoothReady();
      setBluetoothReady(ready);
    };
    
    checkBluetoothReadiness();
    
    // Re-check every 30 seconds in case user enables it
    const interval = setInterval(checkBluetoothReadiness, 30000);
    
    return () => clearInterval(interval);
  }, []);

  const handleSave = () => {
    if (editUsername.trim() && editUsername !== username) {
      onUsernameChange(editUsername.trim());
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditUsername(username);
    setIsEditing(false);
  };

  const handleBluetoothTest = async () => {
    setIsTestingBluetooth(true);
    
    // Check if we're in Brave browser and need special handling
    const browserInfo = getBrowserInfo();
    if (browserInfo.isBrave) {
      // First, run Brave-specific setup check
      const braveSetup = await promptBraveBluetoothSetup();
      if (!braveSetup.success) {
        onBluetoothMessage?.(braveSetup.message, braveSetup.requiresManualSetup ? 'warning' : 'error');
        setIsTestingBluetooth(false);
        return;
      } else {
        // Show Brave preparation message
        onBluetoothMessage?.(braveSetup.message, 'info');
        // Continue with permission request after showing info
      }
    }
    
    const compatibility = await checkBluetoothCompatibility();
    if (!compatibility.isSupported) {
      onBluetoothMessage?.(compatibility.message, 'warning');
      setIsTestingBluetooth(false);
      return;
    }

    // Show initial compatibility message if permission is needed (for non-Brave)
    if (compatibility.needsPermission && !browserInfo.isBrave) {
      onBluetoothMessage?.(compatibility.message, 'info');
    }

    try {
      const result = await requestBluetoothPermission();
      onBluetoothMessage?.(result.message, result.success ? 'success' : 'error');
      
      // If successful and we have device info, log it
      if (result.success && result.deviceInfo) {
        console.log('Connected to Bluetooth device:', result.deviceInfo);
      }
    } catch (error) {
      console.error('Bluetooth test error:', error);
      if (browserInfo.isBrave) {
        onBluetoothMessage?.('🦁 Bluetooth permission failed in Brave. Make sure Web Bluetooth API is enabled in brave://settings/privacy and try again.', 'error');
      } else {
        onBluetoothMessage?.('Failed to test Bluetooth connectivity', 'error');
      }
    } finally {
      setIsTestingBluetooth(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* User Info Section */}
      <div className="bg-gray-700/40 backdrop-blur-sm rounded-xl p-6 border border-gray-600/30">
        <div className="flex items-center space-x-4 mb-6">
          <div className="relative">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary-400 to-secondary-500 flex items-center justify-center text-white text-2xl font-bold uppercase shadow-xl">
              {username.charAt(0)}
            </div>
            <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-400 rounded-full border-2 border-gray-800"></div>
          </div>
          <div className="flex-1">
            {isEditing ? (
              <div className="space-y-3 animate-fade-in">
                <input
                  type="text"
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  className="w-full p-3 bg-gray-600/50 border border-gray-500/50 rounded-lg text-white placeholder-gray-400 outline-none transition-all duration-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 focus:bg-gray-600/70"
                  placeholder="Enter username"
                  maxLength={20}
                  autoFocus
                />
                <div className="flex space-x-2">
                  <button 
                    onClick={handleSave} 
                    className="px-4 py-2 bg-gradient-to-r from-primary-500 to-primary-600 text-white rounded-lg text-sm font-medium transition-all duration-200 hover:from-primary-600 hover:to-primary-700 hover:shadow-lg active:scale-95"
                  >
                    Save
                  </button>
                  <button 
                    onClick={handleCancel} 
                    className="px-4 py-2 bg-gray-600/60 text-gray-300 rounded-lg text-sm transition-all duration-200 hover:bg-gray-600/80 active:scale-95"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-white mb-1">{username}</h3>
                  <p className="text-sm text-gray-400">Online now</p>
                </div>
                <button
                  onClick={() => setIsEditing(true)}
                  className="px-3 py-1.5 bg-gray-600/40 hover:bg-gray-600/60 text-gray-300 rounded-lg text-sm transition-all duration-200 hover:text-white border border-gray-500/30 hover:border-gray-400/50"
                >
                  Edit
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Bluetooth Section */}
      <div className="bg-gray-700/40 backdrop-blur-sm rounded-xl p-6 border border-gray-600/30">
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center">
            <span className="text-blue-400 text-lg">📶</span>
          </div>
          <h4 className="text-lg font-semibold text-white">Bluetooth</h4>
          {bluetoothReady === true && (
            <div className="ml-auto">
              <div className="flex items-center space-x-2 px-3 py-1 bg-green-500/20 rounded-full border border-green-500/30">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                <span className="text-green-400 text-xs font-medium">Ready</span>
              </div>
            </div>
          )}
        </div>
        
        {bluetoothReady === true ? (
          /* Show connection status when Bluetooth is ready */
          <div className="text-center py-6">
            <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-blue-500/20 to-green-500/20 rounded-full flex items-center justify-center border border-blue-500/30">
              <span className="text-3xl">📡</span>
            </div>
            <h5 className="text-lg font-semibold text-white mb-2">Bluetooth Enabled</h5>
            <p className="text-sm text-gray-400 mb-4">
              Web Bluetooth API is enabled and ready for device connections.
            </p>
          </div>
        ) : bluetoothReady === false ? (
          /* Show setup options when Bluetooth is not ready */
          <div>
            {/* Show Brave-specific setup button if in Brave */}
            {getBrowserInfo().isBrave && (
              <div className="mb-3">
                <button
                  onClick={async () => {
                    const setup = await promptBraveBluetoothSetup();
                    onBluetoothMessage?.(setup.message, setup.requiresManualSetup ? 'warning' : setup.success ? 'info' : 'error', setup.actions);
                    // Re-check Bluetooth readiness after setup attempt
                    setTimeout(async () => {
                      const ready = await isBluetoothReady();
                      setBluetoothReady(ready);
                    }, 1000);
                  }}
                  className="w-full p-3 rounded-xl font-medium text-sm transition-all duration-300 border bg-gradient-to-r from-orange-500/80 to-amber-500/80 hover:from-orange-500 hover:to-amber-500 text-white border-orange-500/50 hover:border-orange-400 hover:shadow-lg hover:shadow-orange-500/25 hover:-translate-y-0.5 active:scale-95"
                >
                  <div className="flex items-center justify-center space-x-2">
                    <span>🦁</span>
                    <span>Setup Bluetooth for Brave</span>
                  </div>
                </button>
                <p className="text-xs text-amber-300/80 text-center leading-relaxed mt-2">
                  Brave requires manual setup. Click to get step-by-step instructions.
                </p>
              </div>
            )}
            
            <button
              onClick={async () => {
                await handleBluetoothTest();
                // Re-check Bluetooth readiness after test
                setTimeout(async () => {
                  const ready = await isBluetoothReady();
                  setBluetoothReady(ready);
                }, 1000);
              }}
              disabled={isTestingBluetooth}
              className={`w-full p-4 rounded-xl font-medium text-sm transition-all duration-300 border ${
                isTestingBluetooth
                  ? 'bg-gray-600/50 text-gray-400 cursor-not-allowed border-gray-600/50'
                  : 'bg-gradient-to-r from-blue-500/80 to-purple-500/80 hover:from-blue-500 hover:to-purple-500 text-white border-blue-500/50 hover:border-blue-400 hover:shadow-lg hover:shadow-blue-500/25 hover:-translate-y-0.5 active:scale-95'
              }`}
            >
              <div className="flex items-center justify-center space-x-2">
                {isTestingBluetooth ? (
                  <>
                    <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                    <span>Testing Connection...</span>
                  </>
                ) : (
                  <>
                    <span>🔍</span>
                    <span>Test Bluetooth</span>
                  </>
                )}
              </div>
            </button>
            
            <p className="text-xs text-gray-400 text-center leading-relaxed mt-3">
              Check device compatibility for enhanced features and connectivity options.
            </p>
          </div>
        ) : (
          /* Show loading state while checking */
          <div className="text-center py-6">
            <div className="w-8 h-8 mx-auto mb-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm text-gray-400">Checking Bluetooth availability...</p>
          </div>
        )}
      </div>

      {/* Stats Section */}
      <div className="bg-gray-700/40 backdrop-blur-sm rounded-xl p-6 border border-gray-600/30">
        <h4 className="text-lg font-semibold text-white mb-4">Session Stats</h4>
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center p-3 bg-gray-600/30 rounded-lg">
            <div className="text-2xl font-bold text-primary-400">{messageCount}</div>
            <div className="text-xs text-gray-400">Messages</div>
          </div>
          <div className="text-center p-3 bg-gray-600/30 rounded-lg">
            <div className="text-2xl font-bold text-green-400">1</div>
            <div className="text-xs text-gray-400">Active</div>
          </div>
        </div>
      </div>
    </div>
  );
};
