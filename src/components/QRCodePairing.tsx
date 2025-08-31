import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'react-qr-code';
import { BrowserMultiFormatReader, NotFoundException } from '@zxing/library';

interface QRCodePairingProps {
  deviceInfo: {
    id: string;
    name: string;
    type: 'bluetooth' | 'webrtc';
    connectionData?: any;
  };
  onScanComplete?: (scannedData: any) => void;
}

export const QRCodePairing: React.FC<QRCodePairingProps> = ({
  deviceInfo,
  onScanComplete
}) => {
  const [qrValue, setQrValue] = useState<string>('');
  const [showScanner, setShowScanner] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string>('');
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const codeReader = useRef<BrowserMultiFormatReader | null>(null);

  useEffect(() => {
    console.log('QRCodePairing component mounted with deviceInfo:', deviceInfo);
    // Generate QR code data
    const qrData = JSON.stringify({
      type: 'bitchat-pairing',
      device: deviceInfo,
      timestamp: Date.now()
    });
    setQrValue(qrData);
    console.log('Generated QR value:', qrData);
    console.log('QR value type:', typeof qrData);
    console.log('QR value length:', qrData.length);
  }, [deviceInfo]);

  // Generate a test QR code for debugging
  const generateTestQR = () => {
    const testData = JSON.stringify({
      type: 'bitchat-pairing',
      device: {
        id: 'test-device-123',
        name: 'Test BitChat Device',
        type: 'bluetooth'
      },
      timestamp: Date.now()
    });
    setQrValue(testData);
    console.log('Generated test QR value:', testData);
  };

  // Check camera permission on mount
  useEffect(() => {
    checkCameraPermission();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopScanning();
    };
  }, []);

  const checkCameraPermission = async () => {
    try {
      const result = await navigator.permissions.query({ name: 'camera' as any });
      setHasCameraPermission(result.state === 'granted');
    } catch (error) {
      console.log('Camera permission API not supported, trying direct access');
      setHasCameraPermission(null);
    }
  };

  const requestCameraPermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach(track => track.stop());
      setHasCameraPermission(true);
      return true;
    } catch (error) {
      console.error('Camera permission denied:', error);
      setHasCameraPermission(false);
      setScanError('Camera permission denied. Please allow camera access to scan QR codes.');
      return false;
    }
  };

  const startScanning = async () => {
    if (!videoRef.current) return;

    try {
      setScanError('');
      setIsScanning(true);

      // Request camera permission if not already granted
      if (hasCameraPermission === false) {
        const granted = await requestCameraPermission();
        if (!granted) return;
      }

      // Initialize the code reader
      codeReader.current = new BrowserMultiFormatReader();

      // Start scanning
      const result = await codeReader.current.decodeOnceFromVideoDevice(undefined, videoRef.current);

      if (result) {
        console.log('QR code scanned:', result.getText());
        handleScannedData(result.getText());
      }
    } catch (error) {
      if (error instanceof NotFoundException) {
        setScanError('No QR code found. Please try again.');
      } else {
        console.error('Scanning error:', error);
        setScanError('Failed to access camera. Please check your camera settings.');
      }
    } finally {
      setIsScanning(false);
    }
  };

  const stopScanning = () => {
    if (codeReader.current) {
      codeReader.current.reset();
      codeReader.current = null;
    }
    setIsScanning(false);
  };

  const handleScannedData = (scannedText: string) => {
    console.log('🔍 Raw scanned text:', scannedText);
    console.log('🔍 Scanned text length:', scannedText.length);
    console.log('🔍 Scanned text type:', typeof scannedText);

    try {
      const parsedData = JSON.parse(scannedText);
      console.log('✅ Successfully parsed JSON:', parsedData);

      if (parsedData.type === 'bitchat-pairing' && parsedData.device) {
        console.log('✅ Valid BitChat pairing data scanned:', parsedData);
        if (onScanComplete) {
          onScanComplete(parsedData);
        }
        setShowScanner(false);
        stopScanning();
      } else {
        console.error('❌ Invalid QR code structure. Expected type="bitchat-pairing" and device property');
        console.error('❌ Parsed data:', parsedData);
        setScanError(`Invalid QR code structure. Missing required fields. Got: ${JSON.stringify(parsedData)}`);
      }
    } catch (error) {
      console.error('❌ Failed to parse scanned data as JSON:', error);
      console.error('❌ Raw scanned text that failed:', scannedText);
      setScanError(`Invalid QR code format. Could not parse as JSON. Error: ${(error as Error).message}`);
    }
  };

  // Also set a simple test value initially
  useEffect(() => {
    if (!qrValue) {
      // Set a default test QR code that we know works
      const defaultTestData = JSON.stringify({
        type: 'bitchat-pairing',
        device: {
          id: 'default-test-device',
          name: 'Default Test Device',
          type: 'bluetooth'
        },
        timestamp: Date.now()
      });
      setQrValue(defaultTestData);
      console.log('Set default test QR value:', defaultTestData);
    }
  }, []);

  const handleScanQR = async () => {
    if (hasCameraPermission === false) {
      const granted = await requestCameraPermission();
      if (!granted) return;
    }
    setShowScanner(true);
    setScanError('');
  };

  const handleStartScan = () => {
    startScanning();
  };

  const handleStopScan = () => {
    stopScanning();
    setShowScanner(false);
  };

  return (
    <div className="qr-pairing-container p-4 bg-gray-800 rounded-lg">
      <h3 className="text-lg font-semibold text-white mb-4">QR Code Pairing</h3>

      {/* Generate QR Code */}
      <div className="mb-4">
        <h4 className="text-sm text-gray-300 mb-2">Share this QR code:</h4>
        <div className="bg-white p-4 rounded inline-block">
          {qrValue ? (
            <QRCode value={qrValue} size={200} />
          ) : (
            <div className="w-[200px] h-[200px] bg-gray-200 flex items-center justify-center text-gray-600">
              Generating QR Code...
            </div>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Device: {deviceInfo.name} ({deviceInfo.type})
        </p>
        {qrValue && (
          <details className="mt-2">
            <summary className="text-xs text-gray-500 cursor-pointer">Debug: QR Data</summary>
            <pre className="text-xs text-gray-600 bg-gray-100 p-2 rounded mt-1 overflow-x-auto">
              {qrValue}
            </pre>
          </details>
        )}
        <div className="mt-2">
          <button
            onClick={generateTestQR}
            className="bg-yellow-600 hover:bg-yellow-700 text-white px-3 py-1 rounded text-xs mr-2"
          >
            Generate Test QR
          </button>
          <span className="text-xs text-gray-400">For testing scanner</span>
        </div>
      </div>

      {/* Scan QR Code */}
      <div className="mb-4">
        <button
          onClick={handleScanQR}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded mr-2"
          disabled={isScanning}
        >
          {isScanning ? 'Scanning...' : 'Scan QR Code'}
        </button>

        {hasCameraPermission === false && (
          <p className="text-red-400 text-sm mt-2">
            Camera permission is required to scan QR codes.
          </p>
        )}

        {/* Manual QR Data Input for Testing */}
        <div className="mt-4 p-3 bg-gray-700 rounded">
          <h5 className="text-sm text-gray-300 mb-2">Debug: Manual QR Input</h5>
          <textarea
            placeholder="Paste QR code data here for testing..."
            className="w-full p-2 bg-gray-600 text-white text-xs rounded mb-2"
            rows={3}
            onChange={(e) => {
              const value = e.target.value.trim();
              if (value) {
                try {
                  handleScannedData(value);
                } catch (error) {
                  console.error('Manual input error:', error);
                }
              }
            }}
          />
          <p className="text-xs text-gray-400">
            For testing: paste the JSON data from the "Debug: QR Data" section above
          </p>
        </div>

        {showScanner && (
          <div className="mt-4 p-4 bg-gray-700 rounded">
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-white font-semibold">QR Code Scanner</h4>
              <button
                onClick={handleStopScan}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="relative">
              <video
                ref={videoRef}
                className="w-full max-w-md mx-auto bg-black rounded"
                style={{ maxHeight: '300px' }}
                playsInline
                muted
              />
              <div className="absolute inset-0 border-2 border-blue-400 rounded pointer-events-none">
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-32 h-32 border-2 border-white rounded"></div>
              </div>
            </div>

            <div className="mt-4 flex justify-center space-x-2">
              {!isScanning ? (
                <button
                  onClick={handleStartScan}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded"
                >
                  Start Scanning
                </button>
              ) : (
                <button
                  onClick={handleStopScan}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded"
                >
                  Stop Scanning
                </button>
              )}
            </div>

            {scanError && (
              <p className="text-red-400 text-sm mt-2 text-center">
                {scanError}
              </p>
            )}

            <p className="text-gray-400 text-xs mt-2 text-center">
              Position the QR code within the frame to scan
            </p>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400">
        Use QR codes as a backup when Bluetooth auto-discovery fails.
        Share your QR code with another device or scan theirs to connect.
      </p>
    </div>
  );
};
