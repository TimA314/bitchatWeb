import { useState, useEffect } from 'react'
import { ChatWindow } from './components/ChatWindow'
import { UserProfile } from './components/UserProfile'
import { Toast } from './components/Toast'
import { checkBluetoothCompatibility } from './utils/bluetooth'
import './App.css'

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

  // Load username from localStorage on component mount
  useEffect(() => {
    const savedUsername = localStorage.getItem('bitchat-username');
    if (savedUsername) {
      setUsername(savedUsername);
    }
    
    // Check Bluetooth compatibility on app load
    const bluetoothCheck = checkBluetoothCompatibility();
    if (!bluetoothCheck.isSupported) {
      setToastMessage(bluetoothCheck.message);
      setToastType('warning');
      setToastVisible(true);
    }
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
  };

  const handleBluetoothMessage = (message: string, type: 'warning' | 'error' | 'success' | 'info') => {
    setToastMessage(message);
    setToastType(type);
    setToastVisible(true);
  };

  return (
    <div className="app">
      <Toast
        message={toastMessage}
        type={toastType}
        isVisible={toastVisible}
        onClose={handleCloseToast}
        duration={7000}
      />
      <div className="app-container">
        <div className="sidebar">
          <UserProfile 
            username={username} 
            onUsernameChange={handleUsernameChange}
            onBluetoothMessage={handleBluetoothMessage}
          />
        </div>
        <div className="main-content">
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
