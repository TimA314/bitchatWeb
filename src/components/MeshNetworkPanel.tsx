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
  const [statusMessage, setStatusMessage] = useState('BitChat is listening for nearby devices...');
  const [availableChannels, setAvailableChannels] = useState<Channel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isPassiveMode, setIsPassiveMode] = useState(true);

  // Generate default channel when connected
  const generateChannels = (network: MeshNetwork): Channel[] => {
    return [
      { id: 'public', name: 'Public', members: network.nodes.length + 1, isDefault: true }
    ];
  };

  // Initialize without starting Bluetooth (requires user gesture)
  useEffect(() => {
    const initializeProtocol = async () => {
      // Start networking automatically for passive discovery
      try {
        await meshManager.startNetworking();
        setStatusMessage('BitChat is listening for nearby devices...');
      } catch (error) {
        setStatusMessage('Failed to start networking');
      }
    };

    initializeProtocol();

    // Set up event listeners for network events
    const handleNetworkDiscovered = (event: any) => {
      const network = event.detail;
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
      setConnectedNodes(prev => {
        const existing = prev.find(n => n.id === node.id);
        if (existing) return prev;
        return [...prev, node];
      });
    };

    const handleNodeDisconnected = (event: any) => {
      const node = event.detail;
      setConnectedNodes(prev => prev.filter(n => n.id !== node.id));
    };

    const handleNetworkUpdated = (event: any) => {
      const network = event.detail;
      setAvailableNetworks(prev => 
        prev.map(n => n.id === network.id ? network : n)
      );
      if (currentNetwork?.id === network.id) {
        setCurrentNetwork(network);
        setConnectedNodes(network.nodes);
      }
    };

    const handleBluetoothScanComplete = (event: any) => {
      const { devicesFound, error } = event.detail;
      if (error) {
        setStatusMessage(`Scan failed: ${error}`);
      } else if (devicesFound === 0) {
        setStatusMessage('No BitChat devices found. Listening for connections...');
        setIsPassiveMode(true);
      } else {
        setStatusMessage(`Found ${devicesFound} devices. Check browser dialog.`);
        setIsPassiveMode(false);
      }
      setIsDiscovering(false);
    };

    const handleBluetoothPassiveMode = (event: any) => {
      const { isActive, message } = event.detail;
      setIsPassiveMode(isActive);
      if (isActive) {
        setStatusMessage(message || 'Listening for BitChat devices...');
      } else {
        setStatusMessage('Discovery stopped');
      }
    };

    // Add event listeners
    meshManager.addEventListener('networkDiscovered', handleNetworkDiscovered);
    meshManager.addEventListener('nodeConnected', handleNodeConnected);
    meshManager.addEventListener('nodeDisconnected', handleNodeDisconnected);
    meshManager.addEventListener('networkUpdated', handleNetworkUpdated);
    meshManager.addEventListener('bluetoothScanComplete', handleBluetoothScanComplete);
    meshManager.addEventListener('bluetoothPassiveMode', handleBluetoothPassiveMode);

    return () => {
      // Clean up event listeners
      meshManager.removeEventListener('networkDiscovered', handleNetworkDiscovered);
      meshManager.removeEventListener('nodeConnected', handleNodeConnected);
      meshManager.removeEventListener('nodeDisconnected', handleNodeDisconnected);
      meshManager.removeEventListener('networkUpdated', handleNetworkUpdated);
      meshManager.removeEventListener('bluetoothScanComplete', handleBluetoothScanComplete);
      meshManager.removeEventListener('bluetoothPassiveMode', handleBluetoothPassiveMode);
    };
  }, []);

  const handleConnectToNetwork = async (network: MeshNetwork) => {
    try {
      setAvailableNetworks(prev => {
        const existing = prev.find(n => n.id === network.id);
        if (existing) return prev;
        return [...prev, network];
      });

      setCurrentNetwork(network);
      setStatusMessage(`Connected to ${network.name} successfully!`);
      onStatusChange?.(`Connected to ${network.name}`, network);
      
      const channels = generateChannels(network);
      setAvailableChannels(channels);
      
      const publicChannel = channels.find(ch => ch.isDefault);
      if (publicChannel) {
        setSelectedChannel(publicChannel.id);
        onChannelJoin?.(publicChannel.id, publicChannel.name);
      }
      
      setConnectedNodes(network.nodes);
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setStatusMessage(`Connection error: ${errorMsg}`);
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
          {currentNetwork && (
            <div className="flex items-center space-x-2 px-3 py-1 bg-green-500/20 rounded-full border border-green-500/30">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <span className="text-green-400 text-xs font-medium">Connected</span>
            </div>
          )}
          {isPassiveMode && !currentNetwork && (
            <div className="flex items-center space-x-2 px-3 py-1 bg-blue-500/20 rounded-full border border-blue-500/30">
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
              <span className="text-blue-400 text-xs font-medium">Listening</span>
            </div>
          )}
          {isDiscovering && !currentNetwork && (
            <div className="flex items-center space-x-2 px-3 py-1 bg-purple-500/20 rounded-full border border-purple-500/30">
              <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse"></div>
              <span className="text-purple-400 text-xs font-medium">Discovering</span>
            </div>
          )}
        </div>
      </div>

      {/* Instructions */}
      <div className="mb-4 p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg flex-shrink-0">
        <p className="text-blue-200 text-sm">
          <strong>BitChat Discovery:</strong> BitChat is always listening passively for nearby devices.
          {isPassiveMode ? ' Currently in passive listening mode.' : ' Actively scanning for devices.'}
          Use "Active Discovery" to open a device selection dialog if needed.
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
              BitChat is Listening
            </h3>
            <p className="text-gray-400 mb-6">
              BitChat is always listening passively for nearby devices. Devices will automatically connect when they come into range.
            </p>
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

      </div>
    </div>
  );
};
