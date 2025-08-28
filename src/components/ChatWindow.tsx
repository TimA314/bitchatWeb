import React, { useState, useRef, useEffect } from 'react';

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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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

      {/* Message Input */}
      <form className="p-3 lg:p-6 bg-gray-800/60 backdrop-blur-sm border-t border-gray-700/50" onSubmit={handleSubmit}>
        <div className="flex space-x-2 lg:space-x-4 items-end">
          <div className="flex-1 relative">
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type your message..."
              className="w-full p-3 lg:p-4 bg-gray-700/60 border border-gray-600/50 rounded-2xl resize-none outline-none transition-all duration-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 focus:bg-gray-700/80 text-white placeholder-gray-400 min-h-[48px] lg:min-h-[56px] max-h-[120px] text-sm lg:text-base"
              rows={1}
            />
          </div>
          <button
            type="submit"
            className={`px-4 lg:px-6 py-3 lg:py-4 rounded-2xl font-semibold transition-all duration-200 min-h-[48px] lg:min-h-[56px] text-sm lg:text-base ${
              inputText.trim()
                ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white hover:from-primary-600 hover:to-primary-700 hover:shadow-lg hover:scale-105 active:scale-95'
                : 'bg-gray-600/50 text-gray-400 cursor-not-allowed'
            }`}
            disabled={!inputText.trim()}
          >
            <span className="hidden sm:inline">Send</span>
            <span className="sm:hidden">📤</span>
          </button>
        </div>
      </form>
    </div>
  );
};
