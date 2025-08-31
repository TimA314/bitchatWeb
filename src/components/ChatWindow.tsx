import React, { useState, useEffect, useRef } from 'react';
import { QRCodePairing } from './QRCodePairing';
import { checkBluetoothAvailability } from '../utils/bluetooth';
import { WebBluetoothTransport } from '../utils/bluetooth-transport';
import { Toast } from './Toast';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'other';
  senderName: string;
  timestamp: Date;
}

interface ChatWindowProps {
  messages: Message[];
  onSendMessage: (message: string) => void;
  currentUser: string;
}

const ChatWindow: React.FC<ChatWindowProps> = ({
  messages,
  onSendMessage,
  currentUser: _currentUser
}) => {
  const [inputText, setInputText] = useState('');
  const [bluetoothEnabled, setBluetoothEnabled] = useState(false);
  const [showQRPairing, setShowQRPairing] = useState(false);
  const [scannedDeviceData, setScannedDeviceData] = useState<any>(null);
  const [deviceInfo, setDeviceInfo] = useState<{id: string, name: string, type: 'bluetooth' | 'webrtc'} | null>(null);
  const [connectedDevices, setConnectedDevices] = useState<Set<string>>(new Set());
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<string>('');
  const [toast, setToast] = useState<{
    message: string;
    type: 'warning' | 'error' | 'success' | 'info';
    isVisible: boolean;
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const bluetoothTransportRef = useRef<WebBluetoothTransport | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (showQRPairing) {
      console.log('QR pairing panel is now visible');
    }
  }, [showQRPairing]);

  // Initialize Bluetooth transport
  useEffect(() => {
    if (WebBluetoothTransport.isSupported()) {
      bluetoothTransportRef.current = new WebBluetoothTransport();

      // Initialize the transport
      bluetoothTransportRef.current.initialize().catch(error => {
        console.error('Failed to initialize Bluetooth transport:', error);
      });

      // Set up event listeners for connection events
      bluetoothTransportRef.current.addEventListener('peerConnected', (event: any) => {
        const { peer } = event.detail;
        console.log('🔗 Device connected:', peer);
        setConnectedDevices(prev => new Set([...prev, peer.fingerprint]));
        setConnectionStatus(`✅ Connected to ${peer.nickname}`);
        setIsConnecting(false);

        // Show success toast
        setToast({
          message: `🔗 Successfully connected to ${peer.nickname}!`,
          type: 'success',
          isVisible: true
        });
      });

      bluetoothTransportRef.current.addEventListener('peerDisconnected', (event: any) => {
        const { peerId } = event.detail;
        console.log('🔌 Device disconnected:', peerId);
        setConnectedDevices(prev => {
          const newSet = new Set(prev);
          newSet.delete(peerId);
          return newSet;
        });
        setConnectionStatus(`❌ Disconnected from device`);

        // Show info toast
        setToast({
          message: '🔌 Device disconnected',
          type: 'info',
          isVisible: true
        });
      });

      bluetoothTransportRef.current.addEventListener('dataReceived', (event: any) => {
        const { data, peerId } = event.detail;
        console.log('📨 Data received from', peerId, ':', data);
        // Handle incoming messages here
      });

      bluetoothTransportRef.current.addEventListener('scanComplete', (event: any) => {
        const { devicesFound, error } = event.detail;
        console.log('🔍 Scan complete:', { devicesFound, error });
        if (error) {
          setConnectionStatus(`❌ Scan failed: ${error}`);
          setIsConnecting(false);
        }
      });
    }

    return () => {
      // Cleanup
      if (bluetoothTransportRef.current) {
        bluetoothTransportRef.current.removeEventListener('peerConnected', () => {});
        bluetoothTransportRef.current.removeEventListener('peerDisconnected', () => {});
        bluetoothTransportRef.current.removeEventListener('dataReceived', () => {});
        bluetoothTransportRef.current.removeEventListener('scanComplete', () => {});
      }
    };
  }, []);

  // Generate unique device info on component mount
  useEffect(() => {
    const generateDeviceInfo = () => {
      const storedDeviceId = localStorage.getItem('bitchat-device-id');
      const storedDeviceName = localStorage.getItem('bitchat-device-name');

      let deviceId: string;
      let deviceName: string;

      if (storedDeviceId && storedDeviceName) {
        // Use existing device info
        deviceId = storedDeviceId;
        deviceName = storedDeviceName;
      } else {
        // Generate new unique device info
        deviceId = `device-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Generate a friendly device name with more identifying information
        const adjectives = ['Blue', 'Red', 'Green', 'Purple', 'Orange', 'Pink', 'Silver', 'Gold', 'Crystal', 'Cosmic', 'Azure', 'Crimson', 'Emerald', 'Amber', 'Ruby', 'Sapphire', 'Diamond', 'Pearl', 'Jade', 'Obsidian'];
        const nouns = ['Phoenix', 'Dragon', 'Wolf', 'Eagle', 'Tiger', 'Shark', 'Falcon', 'Panther', 'Owl', 'Bear', 'Lion', 'Hawk', 'Raven', 'Fox', 'Lynx', 'Leopard', 'Cheetah', 'Jaguar', 'Wolf', 'Coyote'];
        const randomAdj = adjectives[Math.floor(Math.random() * adjectives.length)];
        const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
        const randomNum = Math.floor(Math.random() * 9999) + 1;
        const timestamp = Date.now().toString().slice(-4); // Last 4 digits of timestamp
        deviceName = `${randomAdj} ${randomNoun} ${randomNum}-${timestamp}`;

        // Store in localStorage
        localStorage.setItem('bitchat-device-id', deviceId);
        localStorage.setItem('bitchat-device-name', deviceName);

        console.log('🎯 Generated new device identity:', { deviceId, deviceName });
      }

      setDeviceInfo({
        id: deviceId,
        name: deviceName,
        type: 'bluetooth' as const
      });
    };

    generateDeviceInfo();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim()) {
      onSendMessage(inputText.trim());
      setInputText('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
  };

  const handleEnableBluetooth = async () => {
    try {
      const result = await checkBluetoothAvailability();
      setBluetoothEnabled(result.success);
      if (result.success) {
        console.log('Bluetooth is available for BitChat');
        alert('✅ Bluetooth is ready! You can now scan for devices using the 📱 button or by scanning QR codes.');
      } else {
        console.warn('Bluetooth not available:', result.message);
        alert(`❌ Bluetooth Issue: ${result.message}`);
      }
    } catch (error) {
      console.error('Failed to check Bluetooth availability:', error);
      setBluetoothEnabled(false);
      alert('❌ Error checking Bluetooth. Please refresh the page and try again.');
    }
  };

  // Debug function to list all available Bluetooth devices
  const debugListDevices = async () => {
    try {
      if (!navigator.bluetooth) {
        throw new Error('Web Bluetooth not supported in this browser');
      }

      console.log('🔍 Scanning for all available Bluetooth devices...');
      alert('Opening device picker to see all available devices...\n\nCheck the browser console for detailed device information.');

      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true
      });

      console.log('📱 Device selected:', {
        name: device.name,
        id: device.id,
        gatt: device.gatt ? 'GATT available' : 'No GATT'
      });

      alert(`Device found:\nName: ${device.name || 'Unknown'}\nID: ${device.id}\n\nThis information has been logged to the console for debugging.`);

    } catch (error) {
      console.error('❌ Failed to list devices:', error);
      alert('Failed to scan for devices. Make sure Bluetooth is enabled.');
    }
  };

  // Function to regenerate device name
  const regenerateDeviceName = () => {
    const adjectives = ['Blue', 'Red', 'Green', 'Purple', 'Orange', 'Pink', 'Silver', 'Gold', 'Crystal', 'Cosmic', 'Azure', 'Crimson', 'Emerald', 'Amber', 'Ruby', 'Sapphire', 'Diamond', 'Pearl', 'Jade', 'Obsidian'];
    const nouns = ['Phoenix', 'Dragon', 'Wolf', 'Eagle', 'Tiger', 'Shark', 'Falcon', 'Panther', 'Owl', 'Bear', 'Lion', 'Hawk', 'Raven', 'Fox', 'Lynx', 'Leopard', 'Cheetah', 'Jaguar', 'Wolf', 'Coyote'];
    const randomAdj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
    const randomNum = Math.floor(Math.random() * 9999) + 1;
    const timestamp = Date.now().toString().slice(-4); // Last 4 digits of timestamp
    const newDeviceName = `${randomAdj} ${randomNoun} ${randomNum}-${timestamp}`;

    // Update localStorage
    localStorage.setItem('bitchat-device-name', newDeviceName);

    // Update state
    if (deviceInfo) {
      setDeviceInfo({
        ...deviceInfo,
        name: newDeviceName
      });
    }

    console.log('🔄 Regenerated device name:', newDeviceName);
    alert(`Device name updated to: ${newDeviceName}`);
  };

  // Function to close toast
  const closeToast = () => {
    setToast(null);
  };

  // Function to connect to a scanned device
  const connectToScannedDevice = async () => {
    if (!scannedDeviceData || !bluetoothTransportRef.current) {
      alert('❌ No device data available or Bluetooth transport not initialized');
      return;
    }

    setIsConnecting(true);
    setConnectionStatus('🔗 Connecting...');

    try {
      console.log('🔗 Attempting to connect to scanned device:', scannedDeviceData.device);

      // Initialize the transport if not already done
      if (!bluetoothTransportRef.current) {
        bluetoothTransportRef.current = new WebBluetoothTransport();
      }

      // Use the transport's discovery method which handles device selection and connection
      await bluetoothTransportRef.current.discoverPeersWithDialog();

      setConnectionStatus('✅ Connection successful!');
      alert(`✅ Successfully connected to ${scannedDeviceData.device.name}!`);

    } catch (error) {
      console.error('❌ Failed to connect to device:', error);
      setConnectionStatus('❌ Connection failed');
      setIsConnecting(false);

      let errorMessage = 'Failed to connect to device';
      if (error instanceof Error) {
        errorMessage = error.message;
      }

      alert(`❌ Connection failed: ${errorMessage}\n\nMake sure:\n1. The device is nearby and Bluetooth is enabled\n2. The device is discoverable\n3. You have granted Bluetooth permissions`);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex justify-between items-center p-4 lg:p-6 bg-gradient-to-r from-primary-600 to-primary-700 border-b border-gray-700/50">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
            <span className="text-white font-bold text-lg">B</span>
          </div>
          <div>
            <h1 className="text-white font-bold text-xl">BitChat</h1>
            <p className="text-white/70 text-sm">
              {deviceInfo ? `Device: ${deviceInfo.name}` : 'Loading device info...'}
            </p>
            {deviceInfo && (
              <div className="flex items-center space-x-2 mt-1">
                <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center">
                  <span className="text-white font-bold text-xs">
                    {deviceInfo.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <p className="text-white/80 text-xs font-mono">
                  ID: {deviceInfo.id.slice(0, 8)}...
                </p>
              </div>
            )}
            {connectionStatus && (
              <p className="text-white/80 text-xs mt-1">{connectionStatus}</p>
            )}
            {connectedDevices.size > 0 && (
              <p className="text-green-300 text-xs mt-1">
                🔗 Connected to {connectedDevices.size} device{connectedDevices.size !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* Regenerate Device Name Button */}
          <button
            onClick={regenerateDeviceName}
            className="bg-white/20 hover:bg-white/30 text-white px-3 py-2 rounded-lg transition-colors text-sm"
            title="Generate a new device name"
          >
            🔄
          </button>

          {/* Bluetooth Status */}
          <button
            onClick={handleEnableBluetooth}
            className={`px-3 py-2 rounded-lg transition-colors text-sm ${
              bluetoothEnabled
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : 'bg-gray-600 hover:bg-gray-700 text-white'
            }`}
            title={bluetoothEnabled ? 'Bluetooth Ready' : 'Check Bluetooth Status'}
          >
            📱
          </button>

          {/* QR Pairing Toggle */}
          <button
            onClick={() => setShowQRPairing(!showQRPairing)}
            className={`px-3 py-2 rounded-lg transition-colors text-sm ${
              showQRPairing
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-gray-600 hover:bg-gray-700 text-white'
            }`}
            title={showQRPairing ? 'Hide QR Pairing' : 'Show QR Pairing'}
          >
            📷
          </button>

          {/* Debug Device List */}
          <button
            onClick={debugListDevices}
            className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded-lg transition-colors text-sm"
            title="Debug: List all Bluetooth devices"
          >
            🔍
          </button>

          {/* Disconnect All Button */}
          {connectedDevices.size > 0 && (
            <button
              onClick={() => {
                if (bluetoothTransportRef.current) {
                  // Note: We'd need to add a disconnectAll method to the transport
                  alert('Disconnect functionality will be implemented');
                }
              }}
              className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-lg transition-colors text-sm"
              title="Disconnect from all devices"
            >
              ❌
            </button>
          )}
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                message.sender === 'user'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-700 text-white'
              }`}
            >
              <div className="text-xs text-gray-300 mb-1">{message.senderName}</div>
              <div>{message.text}</div>
              <div className="text-xs text-gray-400 mt-1">
                {message.timestamp.toLocaleTimeString()}
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 lg:p-6 border-t border-gray-700/50 bg-gray-800/60 backdrop-blur-sm">
        <form onSubmit={handleSubmit} className="flex space-x-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type your message..."
            className="flex-1 px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:outline-none focus:border-primary-500"
          />
          <button
            type="submit"
            className="px-6 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
          >
            Send
          </button>
        </form>
      </div>

      {/* QR Pairing Panel */}
      {showQRPairing && (
        <div className="p-3 lg:p-6 bg-gray-800/60 backdrop-blur-sm border-t border-gray-700/50">
          <QRCodePairing
            deviceInfo={deviceInfo || {
              id: 'current-device',
              name: 'Loading...',
              type: 'bluetooth' as const
            }}
            onScanComplete={async (scannedData: any) => {
              console.log('Scanned QR code:', scannedData);

              const scannedDevice = scannedData.device;
              console.log('📱 Scanned device info:', scannedDevice);

              // Store scanned data for connection
              setScannedDeviceData(scannedData);

              // Show success toast
              setToast({
                message: `🎯 Device "${scannedDevice.name}" successfully scanned!`,
                type: 'success',
                isVisible: true
              });

              // Show success message
              alert(`QR Code scanned successfully!\n\nDevice: ${scannedDevice.name}\nID: ${scannedDevice.id}\n\nClick "Connect to Device" to establish the connection.`);
            }}
          />

          {/* Connect to Scanned Device Button */}
          {scannedDeviceData && (
            <div className="mt-4 p-4 bg-green-900/30 border border-green-500/50 rounded-lg">
              <div className="flex items-center space-x-3 mb-3">
                <div className="w-12 h-12 bg-green-600 rounded-full flex items-center justify-center">
                  <span className="text-white font-bold text-lg">✓</span>
                </div>
                <div className="flex-1">
                  <h4 className="text-white font-bold text-lg flex items-center">
                    <span className="mr-2">🎯</span>
                    {scannedDeviceData.device.name}
                  </h4>
                  <p className="text-gray-300 text-sm">
                    {scannedDeviceData.device.type === 'bluetooth' ? '📱' : '🌐'} {scannedDeviceData.device.type.toUpperCase()} Device
                  </p>
                  <p className="text-gray-400 text-xs font-mono">
                    ID: {scannedDeviceData.device.id.slice(0, 12)}...
                  </p>
                </div>
              </div>

              {connectionStatus && (
                <div className="mb-3 p-2 bg-gray-700/50 rounded text-sm">
                  <p className="text-gray-200">{connectionStatus}</p>
                </div>
              )}

              <div className="flex space-x-2">
                <button
                  onClick={connectToScannedDevice}
                  disabled={isConnecting}
                  className={`flex-1 px-4 py-3 rounded-lg transition-colors font-semibold ${
                    isConnecting
                      ? 'bg-gray-600 cursor-not-allowed text-gray-400'
                      : 'bg-green-600 hover:bg-green-700 text-white shadow-lg'
                  }`}
                >
                  {isConnecting ? '🔗 Connecting...' : '🔗 Connect to Device'}
                </button>
                <button
                  onClick={() => setScannedDeviceData(null)}
                  className="px-4 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
                  title="Scan a different device"
                >
                  ✕
                </button>
              </div>

              <div className="mt-3 text-xs text-gray-400">
                <p>✅ <strong>Device successfully scanned!</strong></p>
                <p>Ready to connect to <strong>{scannedDeviceData.device.name}</strong></p>
                <p>Make sure both devices have Bluetooth enabled</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Toast Notifications */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          isVisible={toast.isVisible}
          onClose={closeToast}
          duration={4000}
        />
      )}
    </div>
  );
};

export default ChatWindow;
