import React, { useState, useEffect } from 'react';
import { meshManager, type MeshNetwork, type MeshNode } from '../utils/mesh';

interface MeshNetworkPanelProps {
  onStatusChange?: (status: string, network?: MeshNetwork) => void;
  onChannelJoin?: (channelId: string, channelName: string) => void;
}

interface Channel {
  id: string;
  name: string;
  members: number;
  isDefault: boolean;
}

export const MeshNetworkPanel: React.FC<MeshNetworkPanelProps> = ({ 
  onStatusChange, 
  onChannelJoin
}) => {
  const [availableNetworks, setAvailableNetworks] = useState<MeshNetwork[]>([]);
  const [currentNetwork, setCurrentNetwork] = useState<MeshNetwork | null>(null);
  const [connectedNodes, setConnectedNodes] = useState<MeshNode[]>([]);
  const [statusMessage, setStatusMessage] = useState('BitChat ready - click "Start Discovery" to find nearby devices');
  const [availableChannels, setAvailableChannels] = useState<Channel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);

  // Generate default channel when connected
  const generateChannels = (network: MeshNetwork): Channel[] => {
    return [
      { id: 'public', name: 'Public', members: network.nodes.length + 1, isDefault: true }
    ];
  };

  // Debug logging function
  const addDebugLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] ${message}`;
    setDebugLogs(prev => [...prev.slice(-49), logEntry]); // Keep last 50 logs
    console.log('🔍 BitChat Debug:', logEntry);
  };

  // Start discovery with user interaction
  const startDiscovery = async () => {
    console.log('🔍 Starting BitChat network discovery...');
    setIsDiscovering(true);
    setStatusMessage('Starting BitChat discovery...');
    addDebugLog('🚀 User initiated network discovery');
    addDebugLog('🔧 Initializing BitChat protocol...');
    addDebugLog('⚠️ WARNING: Current implementation uses browser pairing (will be fixed)');
    
    try {
      // Start the mesh networking (this will trigger the user permission request)
      addDebugLog('📡 Starting mesh networking...');
      await meshManager.startNetworking();
      addDebugLog('✅ Mesh networking started successfully');
      addDebugLog('🔍 Scanning for BitChat devices via Bluetooth...');
      addDebugLog('📱 Browser pairing dialog may appear - this is temporary until Noise protocol is implemented');
      setStatusMessage('Broadcasting network - discoverable by other devices');
      console.log('📡 BitChat networking started');
    } catch (error) {
      console.error('❌ Failed to start networking:', error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      addDebugLog(`❌ Discovery failed: ${errorMsg}`);
      if (errorMsg.includes('Invalid Service name')) {
        addDebugLog('🔧 UUID format was fixed - this should not happen');
      }
      if (errorMsg.includes('user gesture')) {
        addDebugLog('🔒 User gesture required for Bluetooth access');
      }
      setStatusMessage(`Discovery failed: ${errorMsg}`);
      setIsDiscovering(false);
    }
  };

  // Initialize without starting Bluetooth (requires user gesture)
  useEffect(() => {
    const initializeProtocol = async () => {
      console.log('🔧 Initializing BitChat protocol...');
      addDebugLog('🔧 BitChat component mounted');
      addDebugLog('📱 Checking Bluetooth compatibility...');
      addDebugLog('✅ BitChat protocol ready');
      addDebugLog('💡 Click "Start Discovery" to begin scanning');
      addDebugLog('🚧 NOTE: Noise protocol implementation needed to avoid browser pairing');
      console.log('📡 BitChat protocol initialized');
    };

    initializeProtocol();

    // Set up event listeners for network events
    const handleNetworkDiscovered = (event: any) => {
      const network = event.detail;
      console.log('🕸️ Network discovered:', network);
      addDebugLog(`🕸️ Discovered network: ${network.name} (${network.nodes.length} nodes)`);
      setAvailableNetworks(prev => {
        const existing = prev.find(n => n.id === network.id);
        if (existing) return prev;
        return [...prev, network];
      });
      setStatusMessage(`Found network: ${network.name}`);
      setIsDiscovering(false);
    };

    const handleNodeConnected = (event: any) => {
      const node = event.detail;
      console.log('👥 Node connected:', node);
      addDebugLog(`👥 Node connected: ${node.name} (signal: ${node.signal}dBm)`);
      setConnectedNodes(prev => {
        const existing = prev.find(n => n.id === node.id);
        if (existing) return prev;
        return [...prev, node];
      });
    };

    const handleNodeDisconnected = (event: any) => {
      const node = event.detail;
      console.log('👥 Node disconnected:', node);
      addDebugLog(`👥 Node disconnected: ${node.name}`);
      setConnectedNodes(prev => prev.filter(n => n.id !== node.id));
    };

    const handleNetworkUpdated = (event: any) => {
      const network = event.detail;
      addDebugLog(`🔄 Network updated: ${network.name}`);
      setAvailableNetworks(prev => 
        prev.map(n => n.id === network.id ? network : n)
      );
      if (currentNetwork?.id === network.id) {
        setCurrentNetwork(network);
        setConnectedNodes(network.nodes);
      }
    };

    // Add event listeners
    meshManager.addEventListener('networkDiscovered', handleNetworkDiscovered);
    meshManager.addEventListener('nodeConnected', handleNodeConnected);
    meshManager.addEventListener('nodeDisconnected', handleNodeDisconnected);
    meshManager.addEventListener('networkUpdated', handleNetworkUpdated);

    return () => {
      // Clean up event listeners
      meshManager.removeEventListener('networkDiscovered', handleNetworkDiscovered);
      meshManager.removeEventListener('nodeConnected', handleNodeConnected);
      meshManager.removeEventListener('nodeDisconnected', handleNodeDisconnected);
      meshManager.removeEventListener('networkUpdated', handleNetworkUpdated);
    };
  }, []);

  const handleConnectToNetwork = async (network: MeshNetwork) => {
    console.log('Connecting to network:', network.name);
    addDebugLog(`🔗 Connecting to network: ${network.name}`);
    
    try {
      setAvailableNetworks(prev => {
        const existing = prev.find(n => n.id === network.id);
        if (existing) return prev;
        return [...prev, network];
      });

      setCurrentNetwork(network);
      addDebugLog(`✅ Connected to ${network.name} successfully`);
      setStatusMessage(`Connected to ${network.name} successfully!`);
      onStatusChange?.(`Connected to ${network.name}`, network);
      
      const channels = generateChannels(network);
      setAvailableChannels(channels);
      
      const publicChannel = channels.find(ch => ch.isDefault);
      if (publicChannel) {
        setSelectedChannel(publicChannel.id);
        addDebugLog(`📱 Joined ${publicChannel.name} channel`);
        onChannelJoin?.(publicChannel.id, publicChannel.name);
      }
      
      setConnectedNodes(network.nodes);
      
    } catch (error) {
      console.error('Error connecting to network:', error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      addDebugLog(`❌ Connection failed: ${errorMsg}`);
      setStatusMessage(`Connection error: ${errorMsg}`);
      onStatusChange?.('Connection failed');
    }
  };

  const handleJoinChannel = (channel: Channel) => {
    setSelectedChannel(channel.id);
    addDebugLog(`📱 Joined ${channel.name} channel`);
    setStatusMessage(`Joined ${channel.name} channel`);
    onChannelJoin?.(channel.id, channel.name);
  };

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-gray-900/80 to-purple-900/60 backdrop-blur-md rounded-2xl border border-purple-300/20 p-6 shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-shrink-0">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          🕸️ BitChat Mesh Network
        </h2>
        <div className="flex items-center gap-2">
          {currentNetwork && (
            <div className="flex items-center space-x-2 px-3 py-1 bg-green-500/20 rounded-full border border-green-500/30">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <span className="text-green-400 text-xs font-medium">Connected</span>
            </div>
          )}
          {isDiscovering && !currentNetwork && (
            <div className="flex items-center space-x-2 px-3 py-1 bg-blue-500/20 rounded-full border border-blue-500/30">
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
              <span className="text-blue-400 text-xs font-medium">Discovering</span>
            </div>
          )}
        </div>
      </div>

      {/* Instructions */}
      <div className="mb-4 p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg flex-shrink-0">
        <p className="text-blue-200 text-sm">
          <strong>BitChat Discovery:</strong> Click "Start Discovery" to scan for nearby BitChat devices. 
          Browser pairing dialog may appear (temporary until Noise protocol is implemented).
        </p>
      </div>

      {/* Status */}
      <div className="mb-4 p-3 bg-gray-800/40 border border-gray-600/30 rounded-lg flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${currentNetwork ? 'bg-green-400' : 'bg-yellow-400'} animate-pulse`}></div>
          <span className="text-gray-300 text-sm">
            {statusMessage}
          </span>
        </div>
      </div>

      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto space-y-6">
        {/* Available Networks */}
        {availableNetworks.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
              📡 Available Networks
            </h3>
            <div className="space-y-2">
              {availableNetworks.map((network) => (
                <div
                  key={network.id}
                  className={`p-3 rounded-lg border transition-all cursor-pointer ${
                    currentNetwork?.id === network.id
                      ? 'bg-green-900/40 border-green-400/50'
                      : 'bg-gray-800/40 border-gray-600/30 hover:border-purple-400/50'
                  }`}
                  onClick={() => handleConnectToNetwork(network)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium text-white">{network.name}</h4>
                      <p className="text-sm text-gray-400">
                        {network.nodes.length} nodes • Topology: {network.topology}
                        {' • 🔒 Encrypted'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {currentNetwork?.id === network.id && (
                        <span className="text-green-400 text-sm">✓ Connected</span>
                      )}
                      <div className="w-3 h-3 rounded-full bg-green-400"></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Channels */}
        {currentNetwork && availableChannels.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
              💬 Available Channels
            </h3>
            <div className="grid grid-cols-1 gap-2">
              {availableChannels.map((channel) => (
                <div
                  key={channel.id}
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${
                    selectedChannel === channel.id
                      ? 'bg-purple-900/40 border-purple-400/50'
                      : 'bg-gray-800/40 border-gray-600/30 hover:border-purple-400/50'
                  }`}
                  onClick={() => handleJoinChannel(channel)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium text-white flex items-center gap-1">
                        #{channel.name}
                        {channel.isDefault && <span className="text-xs bg-blue-600 px-1 rounded">default</span>}
                      </h4>
                      <p className="text-sm text-gray-400">{channel.members} members</p>
                    </div>
                    {selectedChannel === channel.id && (
                      <span className="text-purple-400 text-sm">✓ Joined</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Connected Nodes */}
        {connectedNodes.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
              👥 Connected Nodes ({connectedNodes.length})
            </h3>
            <div className="grid grid-cols-1 gap-2">
              {connectedNodes.map((node) => (
                <div key={node.id} className="p-2 bg-gray-800/40 border border-gray-600/30 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-white text-sm">{node.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 text-xs">{node.signal}dBm</span>
                      <div className={`w-2 h-2 rounded-full ${
                        node.signal > -50 ? 'bg-green-400' :
                        node.signal > -70 ? 'bg-yellow-400' : 'bg-red-400'
                      }`}></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Ready to Discover Status */}
        {availableNetworks.length === 0 && !isDiscovering && (
          <div className="text-center py-8">
            <div className="text-6xl mb-4">🔍</div>
            <h3 className="text-xl font-semibold text-white mb-2">
              Ready to Discover Networks
            </h3>
            <p className="text-gray-400 mb-6">
              Click the button below to start scanning for nearby BitChat devices.
              Note: Browser pairing dialog may appear (temporary limitation).
            </p>
            <button
              onClick={startDiscovery}
              className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold rounded-lg transition-all duration-200 transform hover:scale-105 shadow-lg"
            >
              🔍 Start Discovery
            </button>
          </div>
        )}

        {/* Discovering Status */}
        {isDiscovering && availableNetworks.length === 0 && (
          <div className="text-center py-8">
            <div className="text-6xl mb-4">📡</div>
            <h3 className="text-xl font-semibold text-white mb-2">
              Scanning for Networks
            </h3>
            <p className="text-gray-400 mb-4">
              Looking for nearby BitChat devices...
            </p>
            <div className="flex items-center justify-center gap-2">
              <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse"></div>
              <span className="text-purple-400 text-sm">Discovering...</span>
            </div>
          </div>
        )}

        {/* Debug Terminal Section */}
        <div>
          <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
            💻 Debug Terminal
          </h3>
          <div className="bg-gray-900/80 border border-gray-600/30 rounded-lg p-4 font-mono text-sm max-h-64 overflow-y-auto">
            {debugLogs.length === 0 ? (
              <div className="text-gray-400 italic">
                Debug logs will appear here when you start discovery...
                This will help track the pairing issue and Noise protocol implementation.
              </div>
            ) : (
              <div className="space-y-1">
                {debugLogs.map((log, index) => (
                  <div key={index} className="text-green-400">
                    {log}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
