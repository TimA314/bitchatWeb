// Extend Navigator interface to include bluetooth
declare global {
  interface Navigator {
    bluetooth?: Bluetooth;
  }
  
  interface Bluetooth {
    requestDevice(options?: RequestDeviceOptions): Promise<BluetoothDevice>;
    getAvailability(): Promise<boolean>;
    getDevices?(): Promise<BluetoothDevice[]>;
  }
  
  interface RequestDeviceOptions {
    filters?: BluetoothLEScanFilter[];
    optionalServices?: BluetoothServiceUUID[];
    acceptAllDevices?: boolean;
  }
  
  interface BluetoothLEScanFilter {
    services?: BluetoothServiceUUID[];
    name?: string;
    namePrefix?: string;
    manufacturerData?: BluetoothManufacturerDataFilter[];
  }
  
  interface BluetoothManufacturerDataFilter {
    companyIdentifier: number;
    dataPrefix?: BufferSource;
    mask?: BufferSource;
  }
  
  interface BluetoothDevice {
    id: string;
    name?: string;
    gatt?: BluetoothRemoteGATTServer;
    addEventListener(type: string, listener: EventListener): void;
    removeEventListener(type: string, listener: EventListener): void;
  }
  
  interface BluetoothRemoteGATTServer {
    connected: boolean;
    device: BluetoothDevice;
    connect(): Promise<BluetoothRemoteGATTServer>;
    disconnect(): void;
  }
}

export const getBrowserInfo = () => {
  const userAgent = navigator.userAgent;
  const isBrave = (navigator as any).brave && (navigator as any).brave.isBrave;
  
  // More flexible Chrome detection
  const isChrome = /Chrome/.test(userAgent) && !isBrave && !/Edg|OPR|Opera/.test(userAgent);
  const isEdge = /Edg/.test(userAgent);
  const isOpera = /OPR|Opera/.test(userAgent);
  
  return {
    isBrave: isBrave || /Brave/.test(userAgent),
    isChrome,
    isEdge,
    isOpera,
    isSupported: isChrome || isBrave || isEdge || isOpera
  };
};

export const checkBluetoothCompatibility = async (): Promise<{ 
  isSupported: boolean; 
  message: string;
  needsPermission?: boolean;
}> => {
  const browserInfo = getBrowserInfo();
  
  // Debug logging
  console.log('Browser detection:', browserInfo);
  console.log('navigator.bluetooth available:', !!navigator.bluetooth);
  console.log('window.isSecureContext:', window.isSecureContext);
  console.log('User agent:', navigator.userAgent);
  
  // Check if Web Bluetooth API is available
  if (!navigator.bluetooth) {
    if (browserInfo.isBrave) {
      return {
        isSupported: false,
        message: "🔧 Web Bluetooth API is disabled in Brave. Please follow these steps:\n\n1. Click the link below to open Brave flags\n2. Search for 'Web Bluetooth' or scroll to find it\n3. Enable 'Web Bluetooth API'\n4. Restart Brave browser\n5. Refresh this page and try again",
        needsPermission: false
      };
    }
    
    if (browserInfo.isChrome) {
      const isLocalhost = window.location.hostname === 'localhost' || 
                         window.location.hostname === '127.0.0.1' || 
                         window.location.hostname === '0.0.0.0';
      
      if (isLocalhost) {
        return {
          isSupported: false,
          message: "🔧 Web Bluetooth API is not available in Chrome on localhost. To enable it:\n\n1. Go to chrome://flags/#enable-web-bluetooth\n2. Enable 'Web Bluetooth API'\n3. Restart Chrome\n4. Refresh this page\n\nFor development, you can also start Chrome with:\nchrome --enable-web-bluetooth-new-permissions-backend --enable-experimental-web-platform-features"
        };
      } else {
        return {
          isSupported: false,
          message: "🔧 Web Bluetooth API is not available in Chrome. This might be because:\n\n1. You're on HTTP instead of HTTPS (Bluetooth requires secure context)\n2. Web Bluetooth is disabled in Chrome flags\n3. Your Chrome version doesn't support it\n\nTry accessing this site over HTTPS or check chrome://flags/#enable-web-bluetooth"
        };
      }
    }
    
    return {
      isSupported: false,
      message: `Your browser doesn't support Bluetooth connectivity. For the best experience, please use Chrome, Edge, Opera, or Brave (with Web Bluetooth enabled).\n\nDetected: ${browserInfo.isChrome ? 'Chrome' : browserInfo.isBrave ? 'Brave' : browserInfo.isEdge ? 'Edge' : browserInfo.isOpera ? 'Opera' : 'Unknown browser'}`
    };
  }

  // Check if the device supports Bluetooth
  if (!('bluetooth' in navigator)) {
    return {
      isSupported: false,
      message: "Bluetooth is not available on this device or browser."
    };
  }

  // Check for secure context (HTTPS required for Bluetooth, but localhost is allowed)
  const isLocalhost = window.location.hostname === 'localhost' || 
                     window.location.hostname === '127.0.0.1' || 
                     window.location.hostname === '0.0.0.0' ||
                     window.location.hostname.endsWith('.local');
  
  if (!window.isSecureContext && !isLocalhost) {
    return {
      isSupported: false,
      message: "Bluetooth requires a secure connection (HTTPS). Please access this app over HTTPS for Bluetooth functionality."
    };
  }
  
  // Special message for localhost development
  if (isLocalhost && !window.isSecureContext) {
    console.warn('Running on localhost without secure context. Web Bluetooth may not work properly.');
  }

  // Check if Bluetooth is available on the device
  try {
    const isAvailable = await navigator.bluetooth.getAvailability();
    if (!isAvailable) {
      return {
        isSupported: false,
        message: "Bluetooth is not available on this device. Make sure Bluetooth is enabled in your system settings."
      };
    }
  } catch (error) {
    console.warn('Could not check Bluetooth availability:', error);
  }

  // For Brave browser, provide specific guidance
  if (browserInfo.isBrave) {
    return {
      isSupported: true,
      message: "🦁 Bluetooth is supported in Brave! Note: You may need to grant additional permissions. Click 'Test Bluetooth' to check permissions.",
      needsPermission: true
    };
  }

  // For Chrome browser, provide specific guidance
  if (browserInfo.isChrome) {
    return {
      isSupported: true,
      message: "🟢 Bluetooth is supported in Chrome! Click 'Test Bluetooth' to connect to devices.",
      needsPermission: true
    };
  }

  return {
    isSupported: true,
    message: `Bluetooth is supported on this device! (${browserInfo.isEdge ? 'Edge' : browserInfo.isOpera ? 'Opera' : 'Browser'})`,
    needsPermission: true
  };
};

export const promptBraveBluetoothSetup = async (): Promise<{
  success: boolean;
  message: string;
  requiresManualSetup?: boolean;
  actions?: Array<{ label: string; url: string }>;
}> => {
  const browserInfo = getBrowserInfo();
  
  if (!browserInfo.isBrave) {
    return {
      success: false,
      message: "This function is specifically for Brave browser."
    };
  }

  // Step 1: Check if Web Bluetooth API is available
  if (!navigator.bluetooth) {
    return {
      success: false,
      message: "🔧 Web Bluetooth API is disabled in Brave. Please follow these steps:\n\n1. Click the link below to open Brave flags\n2. Search for 'Web Bluetooth' or scroll to find it\n3. Enable 'Web Bluetooth API'\n4. Restart Brave browser\n5. Refresh this page and try again",
      requiresManualSetup: true,
      actions: [
        { label: "🔗 Open Brave Web Bluetooth Flag", url: "brave://flags/#brave-web-bluetooth-api" },
        { label: "🔗 Open Brave Settings", url: "brave://settings/privacy" }
      ]
    };
  }

  // Step 2: Check system Bluetooth availability  
  try {
    const isAvailable = await navigator.bluetooth.getAvailability();
    if (!isAvailable) {
      return {
        success: false,
        message: "🔌 System Bluetooth is disabled. Please:\n\n1. Enable Bluetooth in your system settings\n2. Make sure Bluetooth devices are discoverable\n3. Refresh this page and try again"
      };
    }
  } catch (error) {
    return {
      success: false,
      message: "🔧 Cannot access Bluetooth in Brave. Please try both options:\n\n1. Enable 'Web Bluetooth API' in Brave flags\n2. Enable 'Web Bluetooth API' in privacy settings\n3. Restart Brave browser\n4. Try again",
      requiresManualSetup: true,
      actions: [
        { label: "🔗 Open Brave Web Bluetooth Flag", url: "brave://flags/#brave-web-bluetooth-api" },
        { label: "🔗 Open Privacy Settings", url: "brave://settings/privacy" }
      ]
    };
  }

  // Step 3: Attempt to request permission with user guidance
  try {
    // Show preparatory message
    return {
      success: true,
      message: "🦁 Brave is ready for Bluetooth! When you click 'Test Bluetooth', you'll see a device picker. Select any device to grant permission - you can disconnect afterwards."
    };
  } catch (error) {
    return {
      success: false,
      message: "❓ Unexpected error preparing Bluetooth in Brave. Please refresh and try again."
    };
  }
};

export const isBluetoothReady = async (): Promise<boolean> => {
  try {
    // Check if Web Bluetooth API is available
    if (!navigator.bluetooth) {
      return false;
    }

    // Check if the device supports Bluetooth
    if (!('bluetooth' in navigator)) {
      return false;
    }

    // Check for secure context (HTTPS required for Bluetooth, but localhost is allowed)
    const isLocalhost = window.location.hostname === 'localhost' || 
                       window.location.hostname === '127.0.0.1' || 
                       window.location.hostname === '0.0.0.0' ||
                       window.location.hostname.endsWith('.local');
    
    if (!window.isSecureContext && !isLocalhost) {
      return false;
    }

    // Check if Bluetooth is available on the device
    const isAvailable = await navigator.bluetooth.getAvailability();
    return isAvailable;
  } catch (error) {
    console.warn('Bluetooth readiness check failed:', error);
    return false;
  }
};

export const requestBluetoothPermission = async (): Promise<{
  success: boolean;
  message: string;
  deviceInfo?: { name?: string; id: string };
}> => {
  try {
    // Check if Bluetooth is available first
    if (!navigator.bluetooth) {
      return {
        success: false,
        message: "Bluetooth is not supported on this browser."
      };
    }

    const browserInfo = getBrowserInfo();
    
    // For Brave, provide specific instructions
    if (browserInfo.isBrave) {
      try {
        // First check availability
        const isAvailable = await navigator.bluetooth.getAvailability();
        if (!isAvailable) {
          return {
            success: false,
            message: "🔌 Bluetooth is not available. Enable Bluetooth in your system settings and refresh the page."
          };
        }
      } catch (error) {
        return {
          success: false,
          message: "🔧 Bluetooth access is restricted in Brave. Go to brave://settings/privacy and enable 'Web Bluetooth API'."
        };
      }
    }

    // Request permission to access Bluetooth devices with more specific filters
    const device = await navigator.bluetooth!.requestDevice({
      acceptAllDevices: false,
      filters: [
        { services: ['battery_service'] },
        { services: ['device_information'] },
        { namePrefix: 'BitChat' },
        { namePrefix: 'BT-' },
        { namePrefix: 'Audio' },
        { namePrefix: 'Mouse' },
        { namePrefix: 'Keyboard' },
        // Add more common service filters
      ],
      optionalServices: [
        'battery_service',
        'device_information', 
        'generic_access',
        'generic_attribute'
      ]
    }).catch(async () => {
      // Fallback to acceptAllDevices if specific filters fail
      return await navigator.bluetooth!.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['generic_access', 'device_information']
      });
    });
    
    const deviceName = device.name || 'Unknown Device';
    const deviceId = device.id;
    
    // Try to connect to get more information
    let connectionInfo = '';
    try {
      if (device.gatt) {
        const server = await device.gatt.connect();
        connectionInfo = ` (Connected successfully)`;
        server.disconnect(); // Disconnect after testing
      }
    } catch (connectError) {
      connectionInfo = ` (Device found but connection failed)`;
    }
    
    return {
      success: true,
      message: `✅ Bluetooth permission granted! Found device: "${deviceName}"${connectionInfo}`,
      deviceInfo: { name: deviceName, id: deviceId }
    };
    
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'NotFoundError') {
        return {
          success: false,
          message: "❌ No Bluetooth device was selected. Make sure your device is discoverable and try again."
        };
      } else if (error.name === 'NotAllowedError') {
        const browserInfo = getBrowserInfo();
        if (browserInfo.isBrave) {
          return {
            success: false,
            message: "🚫 Bluetooth access denied. In Brave, check brave://settings/privacy and enable 'Web Bluetooth API', then refresh and try again."
          };
        }
        return {
          success: false,
          message: "🚫 Bluetooth access was denied. Please allow Bluetooth permissions and try again."
        };
      } else if (error.name === 'SecurityError') {
        return {
          success: false,
          message: "🔒 Bluetooth access blocked for security reasons. Make sure you're on HTTPS and try again."
        };
      } else {
        return {
          success: false,
          message: `⚠️ Bluetooth error: ${error.message}. Try refreshing the page and enabling Bluetooth in your system settings.`
        };
      }
    }
    
    return {
      success: false,
      message: "❓ An unknown error occurred while accessing Bluetooth. Please check your browser settings and try again."
    };
  }
};

export {};

// BitChat Bluetooth Transport Layer
export class BluetoothTransport extends EventTarget {
  private connectedDevices: Map<string, BluetoothDevice> = new Map();
  private isInitialized: boolean = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    const isReady = await isBluetoothReady();
    if (!isReady) {
      throw new Error('Bluetooth not ready - check device settings and permissions');
    }
    
    this.isInitialized = true;
    console.log('🔗 Bluetooth transport initialized');
  }

  async shutdown(): Promise<void> {
    for (const [deviceId, device] of this.connectedDevices) {
      try {
        if (device.gatt?.connected) {
          device.gatt.disconnect();
        }
      } catch (error) {
        console.warn(`Error disconnecting device ${deviceId}:`, error);
      }
    }
    
    this.connectedDevices.clear();
    this.isInitialized = false;
    console.log('🔌 Bluetooth transport shut down');
  }

  async sendToDevice(deviceId: string, data: Uint8Array): Promise<void> {
    const device = this.connectedDevices.get(deviceId);
    if (!device) {
      throw new Error(`Device ${deviceId} not connected`);
    }
    
    // TODO: Implement actual Bluetooth data transmission
    console.log(`📤 Sending ${data.length} bytes to device ${deviceId}`);
    
    // Simulate data transmission for now
    setTimeout(() => {
      this.dispatchEvent(new CustomEvent('dataSent', {
        detail: { deviceId, data }
      }));
    }, 10);
  }

  async broadcast(data: Uint8Array): Promise<void> {
    // TODO: Implement Bluetooth LE advertising for broadcast
    console.log(`📢 Broadcasting ${data.length} bytes to all devices`);
    
    // Send to all connected devices for now
    for (const [deviceId] of this.connectedDevices) {
      await this.sendToDevice(deviceId, data);
    }
  }

  async relayToAll(data: Uint8Array, excludeDevice: string): Promise<void> {
    console.log(`🔁 Relaying ${data.length} bytes to all devices except ${excludeDevice}`);
    
    for (const [deviceId] of this.connectedDevices) {
      if (deviceId !== excludeDevice) {
        await this.sendToDevice(deviceId, data);
      }
    }
  }

  async connectToDevice(deviceId: string): Promise<void> {
    // TODO: Implement device connection logic
    console.log(`🔗 Connecting to device ${deviceId}`);
    
    // Simulate connection for now
    setTimeout(() => {
      this.dispatchEvent(new CustomEvent('peerConnected', {
        detail: { peerId: deviceId }
      }));
    }, 100);
  }

  async disconnectDevice(deviceId: string): Promise<void> {
    const device = this.connectedDevices.get(deviceId);
    if (device && device.gatt?.connected) {
      device.gatt.disconnect();
    }
    
    this.connectedDevices.delete(deviceId);
    
    this.dispatchEvent(new CustomEvent('peerDisconnected', {
      detail: { peerId: deviceId }
    }));
  }

  getConnectedDevices(): string[] {
    return Array.from(this.connectedDevices.keys());
  }

  isDeviceConnected(deviceId: string): boolean {
    const device = this.connectedDevices.get(deviceId);
    return device?.gatt?.connected || false;
  }

  // Simulate receiving data (for testing)
  simulateDataReceived(deviceId: string, data: Uint8Array): void {
    this.dispatchEvent(new CustomEvent('dataReceived', {
      detail: { data, peerId: deviceId }
    }));
  }
}
