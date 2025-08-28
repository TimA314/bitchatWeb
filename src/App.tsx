import { useState, useEffect } from 'react'
import { ChatWindow } from './components/ChatWindow'
import { UserProfile } from './components/UserProfile'
import { Toast } from './components/Toast'
import { checkBluetoothCompatibility } from './utils/bluetooth'

interface Message {
  id: string;
  text: string;
  timestamp: Date;
  sender: 'user' | 'other';
  senderName: string;
}

function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: 'Welcome to BitChat! This is a demo message.',
      timestamp: new Date(),
      sender: 'other',
      senderName: 'BitChat Bot'
    }
  ]);
  const [username, setUsername] = useState('User');
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'warning' | 'error' | 'success' | 'info'>('info');
  const [toastActions, setToastActions] = useState<Array<{ label: string; url: string }>>([]);

  // Load username from localStorage on component mount
  useEffect(() => {
    const savedUsername = localStorage.getItem('bitchat-username');
    if (savedUsername) {
      setUsername(savedUsername);
    }
    
    // Check Bluetooth compatibility on app load
    const checkBluetooth = async () => {
      try {
        const bluetoothCheck = await checkBluetoothCompatibility();
        if (!bluetoothCheck.isSupported) {
          setToastMessage(bluetoothCheck.message);
          setToastType('warning');
          setToastVisible(true);
        }
      } catch (error) {
        console.error('Failed to check Bluetooth compatibility:', error);
      }
    };
    
    checkBluetooth();
  }, []);

  const handleSendMessage = (text: string) => {
    const newMessage: Message = {
      id: Date.now().toString(),
      text,
      timestamp: new Date(),
      sender: 'user',
      senderName: username
    };
    
    setMessages(prev => [...prev, newMessage]);
    
    // Simulate a response (in a real app, this would be WebSocket or API call)
    setTimeout(() => {
      const botResponse: Message = {
        id: (Date.now() + 1).toString(),
        text: `Echo: ${text}`,
        timestamp: new Date(),
        sender: 'other',
        senderName: 'BitChat Bot'
      };
      setMessages(prev => [...prev, botResponse]);
    }, 1000);
  };

  const handleUsernameChange = (newUsername: string) => {
    setUsername(newUsername);
    localStorage.setItem('bitchat-username', newUsername);
  };

  const handleCloseToast = () => {
    setToastVisible(false);
    setToastActions([]);
  };

  const handleBluetoothMessage = (message: string, type: 'warning' | 'error' | 'success' | 'info', actions?: Array<{ label: string; url: string }>) => {
    setToastMessage(message);
    setToastType(type);
    setToastActions(actions || []);
    setToastVisible(true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white">
      <Toast
        message={toastMessage}
        type={toastType}
        isVisible={toastVisible}
        onClose={handleCloseToast}
        duration={7000}
        actions={toastActions}
      />
      
      {/* Mobile Layout */}
      <div className="flex flex-col h-screen lg:hidden">
        <div className="bg-gray-800/80 backdrop-blur-sm border-b border-gray-700 p-4 shadow-lg">
          <UserProfile 
            username={username} 
            onUsernameChange={handleUsernameChange}
            onBluetoothMessage={handleBluetoothMessage}
            messageCount={messages.length}
          />
        </div>
        <div className="flex-1 bg-gray-800">
          <ChatWindow 
            messages={messages}
            onSendMessage={handleSendMessage}
            currentUser={username}
          />
        </div>
      </div>

      {/* Desktop Layout */}
      <div className="hidden lg:flex h-screen p-6 gap-6 max-w-7xl mx-auto">
        <div className="w-80 bg-gray-800/60 backdrop-blur-xl border border-gray-700/50 rounded-2xl p-6 shadow-2xl">
          <UserProfile 
            username={username} 
            onUsernameChange={handleUsernameChange}
            onBluetoothMessage={handleBluetoothMessage}
            messageCount={messages.length}
          />
        </div>
        <div className="flex-1 bg-gray-800/60 backdrop-blur-xl border border-gray-700/50 rounded-2xl overflow-hidden shadow-2xl">
          <ChatWindow 
            messages={messages}
            onSendMessage={handleSendMessage}
            currentUser={username}
          />
        </div>
      </div>
    </div>
  )
}

export default App
