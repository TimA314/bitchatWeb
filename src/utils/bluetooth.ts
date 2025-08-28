export const checkBluetoothCompatibility = (): { 
  isSupported: boolean; 
  message: string;
} => {
  // Check if the browser supports Web Bluetooth API
  if (!navigator.bluetooth) {
    return {
      isSupported: false,
      message: "Your browser doesn't support Bluetooth connectivity. For the best experience, please use Chrome, Edge, or Opera on desktop, or Chrome on Android."
    };
  }

  // Check if the device supports Bluetooth
  if (!('bluetooth' in navigator)) {
    return {
      isSupported: false,
      message: "Bluetooth is not available on this device or browser."
    };
  }

  // Additional check for secure context (HTTPS required for Bluetooth)
  if (!window.isSecureContext) {
    return {
      isSupported: false,
      message: "Bluetooth requires a secure connection (HTTPS). Please access this app over HTTPS for Bluetooth functionality."
    };
  }

  return {
    isSupported: true,
    message: "Bluetooth is supported on this device!"
  };
};

export const requestBluetoothPermission = async (): Promise<{
  success: boolean;
  message: string;
}> => {
  try {
    // Check if Bluetooth is available first
    if (!navigator.bluetooth) {
      return {
        success: false,
        message: "Bluetooth is not supported on this browser."
      };
    }

    // Request permission to access Bluetooth devices
    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: ['generic_access']
    });
    
    return {
      success: true,
      message: `Connected to Bluetooth device: ${device.name || 'Unknown Device'}`
    };
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'NotFoundError') {
        return {
          success: false,
          message: "No Bluetooth device was selected or found."
        };
      } else if (error.name === 'NotAllowedError') {
        return {
          success: false,
          message: "Bluetooth access was denied by the user."
        };
      } else {
        return {
          success: false,
          message: `Bluetooth error: ${error.message}`
        };
      }
    }
    
    return {
      success: false,
      message: "An unknown error occurred while accessing Bluetooth."
    };
  }
};
