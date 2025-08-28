import React, { useState } from 'react';
import { requestBluetoothPermission, checkBluetoothCompatibility } from '../utils/bluetooth';
import './UserProfile.css';

interface UserProfileProps {
  username: string;
  onUsernameChange: (newUsername: string) => void;
  onBluetoothMessage?: (message: string, type: 'warning' | 'error' | 'success' | 'info') => void;
}

export const UserProfile: React.FC<UserProfileProps> = ({
  username,
  onUsernameChange,
  onBluetoothMessage
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editUsername, setEditUsername] = useState(username);
  const [isTestingBluetooth, setIsTestingBluetooth] = useState(false);

  const handleSave = () => {
    if (editUsername.trim() && editUsername !== username) {
      onUsernameChange(editUsername.trim());
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditUsername(username);
    setIsEditing(false);
  };

  const handleBluetoothTest = async () => {
    setIsTestingBluetooth(true);
    
    const compatibility = checkBluetoothCompatibility();
    if (!compatibility.isSupported) {
      onBluetoothMessage?.(compatibility.message, 'warning');
      setIsTestingBluetooth(false);
      return;
    }

    try {
      const result = await requestBluetoothPermission();
      onBluetoothMessage?.(result.message, result.success ? 'success' : 'error');
    } catch (error) {
      onBluetoothMessage?.('Failed to test Bluetooth connectivity', 'error');
    } finally {
      setIsTestingBluetooth(false);
    }
  };

  return (
    <div className="user-profile">
      <div className="profile-header">
        <div className="avatar">
          {username.charAt(0).toUpperCase()}
        </div>
        <div className="profile-info">
          {isEditing ? (
            <div className="edit-username">
              <input
                type="text"
                value={editUsername}
                onChange={(e) => setEditUsername(e.target.value)}
                className="username-input"
                maxLength={20}
                autoFocus
              />
              <div className="edit-buttons">
                <button onClick={handleSave} className="save-btn">
                  Save
                </button>
                <button onClick={handleCancel} className="cancel-btn">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="username-display">
              <h3>{username}</h3>
              <button
                onClick={() => setIsEditing(true)}
                className="edit-btn"
              >
                Edit
              </button>
            </div>
          )}
        </div>
      </div>
      
      <div className="bluetooth-section">
        <button
          onClick={handleBluetoothTest}
          disabled={isTestingBluetooth}
          className="bluetooth-test-btn"
        >
          {isTestingBluetooth ? 'Testing...' : 'Test Bluetooth'}
        </button>
        <p className="bluetooth-info">
          Check if your device supports Bluetooth connectivity for enhanced features.
        </p>
      </div>
    </div>
  );
};
