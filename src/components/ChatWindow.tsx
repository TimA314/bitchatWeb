import React, { useState, useRef, useEffect } from 'react';
import { requestBluetoothPermissions, startBluetoothDiscovery } from '../utils/bitchat';
import { QRCodePairing } from './QRCodePairing';

interface Message {
  id: string;
  text: string;
  timestamp: Date;
  sender: 'user' | 'other';
  senderName: string;
}

interface ChatWindowProps {
  messages: Message[];
  onSendMessage: (text: string) => void;
  currentUser: string;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({
  messages,
  onSendMessage,
  currentUser: _currentUser
}) => {
  const [inputText, setInputText] = useState('');
  const [bluetoothEnabled, setBluetoothEnabled] = useState(false);
  const [showQRPairing, setShowQRPairing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
    const granted = await requestBluetoothPermissions();
    setBluetoothEnabled(granted);
    if (granted) {
      console.log('Bluetooth enabled for BitChat');
      // Start discovery after enabling
      try {
        await startBluetoothDiscovery();
      } catch (error) {
        console.error('Failed to start Bluetooth discovery:', error);
      }
    } else {
      console.warn('Bluetooth permission denied');
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex justify-between items-center p-4 lg:p-6 bg-gradient-to-r from-primary-600 to-primary-700 border-b border-gray-700/50">
        <div className="flex items-center space-x-3">
          <div className="w-6 h-6 lg:w-8 lg:h-8 bg-primary-400 rounded-full flex items-center justify-center">
            <span className="text-white font-bold text-xs lg:text-sm">BC</span>
          </div>
          <h2 className="text-lg lg:text-xl font-bold text-white">BitChat</h2>
        </div>
        <div className="flex items-center space-x-2 text-xs lg:text-sm text-primary-100">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
          <span className="font-medium hidden sm:inline">Online</span>
          <span className="font-medium sm:hidden">●</span>
          <button
            onClick={handleEnableBluetooth}
            className={`ml-2 px-2 py-1 text-xs rounded-lg transition-colors ${
              bluetoothEnabled
                ? 'bg-green-600 text-white'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
            title={bluetoothEnabled ? 'Bluetooth enabled' : 'Enable Bluetooth for offline messaging'}
          >
            {bluetoothEnabled ? 'BT ✓' : 'BT'}
          </button>
                    <button
            onClick={() => {
              console.log('QR button clicked, current showQRPairing:', showQRPairing);
              setShowQRPairing(!showQRPairing);
            }}
            className="ml-2 px-2 py-1 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
            title="QR Code Pairing"
          >
            QR
          </button>
        </div>
      </div>
      
      {/* Messages */}
      <div className="flex-1 p-3 lg:p-6 overflow-y-auto bg-gradient-to-b from-gray-800/50 to-gray-900/50 space-y-3 lg:space-y-6">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex max-w-[85%] sm:max-w-[80%] ${message.sender === 'user' ? 'self-end' : 'self-start'} animate-fade-in`}
          >
            <div className={`group relative rounded-2xl p-3 lg:p-4 shadow-lg backdrop-blur-sm transition-all duration-200 hover:shadow-xl ${
              message.sender === 'user' 
                ? 'bg-gradient-to-br from-primary-500 to-primary-600 text-white ml-auto' 
                : 'bg-gray-700/80 border border-gray-600/50 text-gray-100'
            }`}>
              <div className="flex justify-between items-center mb-1 lg:mb-2 text-xs opacity-80">
                <span className="font-semibold truncate max-w-[120px] sm:max-w-none">{message.senderName}</span>
                <span className="text-xs ml-2 flex-shrink-0">
                  {message.timestamp.toLocaleTimeString([], { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  })}
                </span>
              </div>
              <div className="leading-relaxed break-words text-sm lg:text-base">{message.text}</div>
              
              {/* Message tail */}
              <div className={`absolute top-3 lg:top-4 ${
                message.sender === 'user' 
                  ? '-right-1 w-0 h-0 border-l-[6px] border-l-primary-500 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent' 
                  : '-left-1 w-0 h-0 border-r-[6px] border-r-gray-700 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent'
              }`}></div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* QR Code Pairing */}
      {showQRPairing && (
        <div className="p-3 lg:p-6 bg-gray-800/60 backdrop-blur-sm border-t border-gray-700/50">
          <QRCodePairing
            deviceInfo={{
              id: 'current-device',
              name: 'My BitChat Device',
              type: 'bluetooth'
            }}
            onScanComplete={async (scannedData) => {
              console.log('Scanned QR code:', scannedData);
              
              try {
                const scannedDevice = scannedData.device;
                console.log('📱 Scanned device info:', scannedDevice);
                
                // For now, show success and log the scanned data
                // In a full implementation, this would initiate a direct connection
                // using the device info from the QR code
                alert(`QR Code scanned successfully!\n\nDevice: ${scannedDevice.name}\nID: ${scannedDevice.id}\n\nThe device information has been captured. In a production app, this would initiate a direct Bluetooth connection to the scanned device.`);
                
                // TODO: Implement direct device connection using scanned data
                // This would involve:
                // 1. Extracting connection parameters from QR data
                // 2. Using Web Bluetooth API to connect to the specific device
                // 3. Establishing BitChat protocol handshake
                
              } catch (error) {
                console.error('Failed to process scanned QR code:', error);
                alert('Failed to process scanned QR code. Please try again.');
              }
              
              setShowQRPairing(false);
            }}
          />
        </div>
      )}

      {/* Message Input */}
      <form className="p-3 lg:p-6 bg-gray-800/60 backdrop-blur-sm border-t border-gray-700/50" onSubmit={handleSubmit}>
        <div className="flex space-x-2 lg:space-x-4 items-center">

          <div className="flex-1">
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              id='message-input'
              onKeyUp={handleKeyPress}
              placeholder="Type your message..."
              className="
                w-full 
                h-full 
                p-3 
                lg:p-4 
                bg-gray-700/60 
                border 
                border-gray-600/50 
                rounded-2xl 
                resize-none 
                outline-none 
                transition-all 
                duration-200 
                focus:border-primary-500 
                focus:ring-2 
                focus:ring-primary-500/20 
                focus:bg-gray-700/80 
                text-white 
                placeholder-gray-400 
                min-h-[48px] 
                text-sm 
                lg:text-base"
              rows={1}
            />
          </div>

            <button
            type="submit"
            className={`px-4 lg:px-6 py-3 lg:py-4 rounded-2xl font-semibold transition-all duration-200 h-full text-sm lg:text-base ${
              inputText.trim()
              ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white hover:from-primary-600 hover:to-primary-700 hover:shadow-lg hover:scale-105 active:scale-95'
              : 'bg-gray-600/50 text-gray-400 cursor-not-allowed'
            }`}
            disabled={!inputText.trim()}
            >
            <span className="hidden sm:inline">Send</span>
            <svg className="sm:hidden w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
            </button>
          
        </div>
      </form>
    </div>
  );
};
