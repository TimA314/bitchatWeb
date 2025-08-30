import React, { useState } from 'react';
import { meshManager, type MeshNetwork, type MeshNode } from '../utils/mesh';

interface MeshNetworkPanelProps {
  onStatusChange?: (status: string, network?: MeshNetwork) => void;
  onChannelJoin?: (channelId: string, channelName: string) => void;
  onOpenScanModal?: () => void;
}

interface Channel {
  id: string;
  name: string;
  members: number;
  isDefault: boolean;
}

export const MeshNetworkPanel: React.FC<MeshNetworkPanelProps> = ({ 
  onStatusChange, 
  onChannelJoin, 
  onOpenScanModal 
}) => {
  const [availableNetworks, setAvailableNetworks] = useState<MeshNetwork[]>([]);
  const [currentNetwork, setCurrentNetwork] = useState<MeshNetwork | null>(null);
  const [connectedNodes, setConnectedNodes] = useState<MeshNode[]>([]);
  const [statusMessage, setStatusMessage] = useState('');
  const [availableChannels, setAvailableChannels] = useState<Channel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [isBroadcasting, setIsBroadcasting] = useState(false);

  // Generate default channel when connected
  const generateChannels = (network: MeshNetwork): Channel[] => {
    return [
      { id: 'public', name: 'Public', members: network.nodes.length + 1, isDefault: true }
    ];
  };

  // Listen for mesh manager events
  React.useEffect(() => {
    const handleBroadcastStarted = () => {
      setIsBroadcasting(true);
      setStatusMessage('Broadcasting network - discoverable by other devices');
    };

    meshManager.addEventListener('networkBroadcastStarted', handleBroadcastStarted);

    return () => {
      meshManager.removeEventListener('networkBroadcastStarted', handleBroadcastStarted);
    };
  }, []);

  const handleScanForNetworks = async () => {
    console.log('🔍 Starting BitChat network discovery and broadcasting...');
    
    // Start broadcasting our presence so other devices can discover us
    try {
      meshManager.startBroadcasting();
      console.log('📡 BitChat broadcasting started');
    } catch (error) {
      console.error('❌ Failed to start broadcasting:', error);
    }
    
    // Open the scan modal to discover other networks
    if (onOpenScanModal) {
      onOpenScanModal();
    }
  };

  const handleConnectToNetwork = async (network: MeshNetwork) => {
    console.log('Connecting to network:', network.name);
    
    try {
      // Add the network to available networks
      setAvailableNetworks(prev => {
        const existing = prev.find(n => n.id === network.id);
        if (existing) return prev;
        return [...prev, network];
      });

      // Connect using mesh manager
      const success = await meshManager.connectToNetwork(network.id);
      if (success) {
        setCurrentNetwork(network);
        setStatusMessage(`Connected to ${network.name} successfully!`);
        onStatusChange?.(`Connected to ${network.name}`, network);
        
        // Generate available channels for this network
        const channels = generateChannels(network);
        setAvailableChannels(channels);
        
        // Auto-select public channel
        const publicChannel = channels.find(ch => ch.isDefault);
        if (publicChannel) {
          setSelectedChannel(publicChannel.id);
          onChannelJoin?.(publicChannel.id, publicChannel.name);
        }
        
        // Use actual network nodes
        setConnectedNodes(network.nodes);
      } else {
        setStatusMessage(`Failed to connect to ${network.name}`);
        onStatusChange?.('Connection failed');
      }
    } catch (error) {
      console.error('Error connecting to network:', error);
      setStatusMessage(`Connection error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      onStatusChange?.('Connection failed');
    }
  };

  const handleJoinChannel = (channel: Channel) => {
    setSelectedChannel(channel.id);
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
          {(currentNetwork || isBroadcasting) && (
            <div className="flex items-center space-x-2 px-3 py-1 bg-green-500/20 rounded-full border border-green-500/30">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <span className="text-green-400 text-xs font-medium">
                {currentNetwork ? 'Connected' : 'Broadcasting'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Instructions */}
      <div className="mb-4 p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg flex-shrink-0">
        <p className="text-blue-200 text-sm">
          <strong>Getting Started:</strong> Make sure your Android BitChat app is running with Bluetooth enabled. 
          This app will automatically discover and connect to nearby BitChat mesh networks.
        </p>
      </div>

      {/* Status */}
      <div className="mb-4 p-3 bg-gray-800/40 border border-gray-600/30 rounded-lg flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${currentNetwork ? 'bg-green-400' : 'bg-yellow-400'} animate-pulse`}></div>
          <span className="text-gray-300 text-sm">
            {statusMessage || 'BitChat networks will auto-connect when found'}
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

        {/* Unified Scan Section */}
        <div className="text-center py-8">
          <div className="text-6xl mb-4">�</div>
          <h3 className="text-xl font-semibold text-white mb-2">
            {availableNetworks.length > 0 ? 'Scan for More Networks' : 'Discover BitChat Networks'}
          </h3>
          <p className="text-gray-400 mb-4">
            {availableNetworks.length > 0 
              ? 'Find additional mesh networks in your area'
              : 'Make sure BitChat apps are running with Bluetooth enabled nearby'
            }
          </p>
          <button
            onClick={handleScanForNetworks}
            className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 rounded-lg text-white font-medium transition-all duration-200 hover:shadow-lg hover:shadow-purple-500/25 active:scale-95"
          >
            🕸️ Scan for Mesh Networks
          </button>
        </div>
      </div>
    </div>
  );
};
