import { useState, useEffect } from 'react';
import './NotificationToast.css';

interface Notification {
  id: string;
  monitorId: string;
  location: string;
  timestamp: string;
  imageDetails?: {
    resolution?: string;
    provider?: string;
    captureDate?: string;
  };
}

interface NotificationToastProps {
  notification: Notification;
  onClose: () => void;
}

export function NotificationToast({ notification, onClose }: NotificationToastProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    // Auto-dismiss after 10 seconds
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onClose, 300); // Wait for fade animation
    }, 10000);

    return () => clearTimeout(timer);
  }, [onClose]);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 300);
  };

  return (
    <div className={`notification-toast ${isVisible ? 'visible' : 'hidden'}`}>
      <div className="toast-header">
        <span className="toast-icon">🛰️</span>
        <span className="toast-title">New Satellite Imagery Available</span>
        <button className="toast-close" onClick={handleClose}>×</button>
      </div>
      <div className="toast-body">
        <p className="toast-location">{notification.location}</p>
        {notification.imageDetails?.resolution && (
          <p className="toast-detail">
            <strong>Resolution:</strong> {notification.imageDetails.resolution}
          </p>
        )}
        {notification.imageDetails?.provider && (
          <p className="toast-detail">
            <strong>Provider:</strong> {notification.imageDetails.provider}
          </p>
        )}
        {notification.imageDetails?.captureDate && (
          <p className="toast-detail">
            <strong>Captured:</strong> {new Date(notification.imageDetails.captureDate).toLocaleDateString()}
          </p>
        )}
      </div>
    </div>
  );
}

interface NotificationCenterProps {
  onNotification?: (notification: Notification) => void;
}

export function NotificationCenter({ onNotification }: NotificationCenterProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    console.log('📡 Connecting to SSE endpoint...');
    const eventSource = new EventSource('http://localhost:3001/api/notifications/stream');

    eventSource.onopen = () => {
      console.log('✅ SSE connection established');
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('📨 SSE message received:', data);

        if (data.type === 'new_imagery') {
          const notification = data.notification;
          setNotifications((prev) => [...prev, notification]);
          onNotification?.(notification);

          // Play notification sound (optional)
          const audio = new Audio('/notification.mp3');
          audio.play().catch(() => console.log('No notification sound available'));
        }
      } catch (error) {
        console.error('Error parsing SSE message:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('❌ SSE connection error:', error);
      eventSource.close();
    };

    return () => {
      console.log('📡 Closing SSE connection');
      eventSource.close();
    };
  }, [onNotification]);

  const removeNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  return (
    <div className="notification-center">
      {notifications.map((notification) => (
        <NotificationToast
          key={notification.id}
          notification={notification}
          onClose={() => removeNotification(notification.id)}
        />
      ))}
    </div>
  );
}
