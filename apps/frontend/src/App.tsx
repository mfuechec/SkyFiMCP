import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { isValidCoordinate } from '@skyfi-mcp/shared';
import { Chatbot } from './components/Chatbot';
import { NotificationCenter } from './components/NotificationToast';
import L from 'leaflet';

export interface DynamicMarker {
  id: string;
  name: string;
  lat: number;
  lng: number;
  description: string;
  category?: string;
  additionalInfo?: Record<string, any>;
  satelliteInfo?: {
    available: boolean;
    estimatedCost?: string;
    resolution?: string;
  };
}

// Component to handle map updates
function MapController({ center, zoom, markers }: { center: [number, number]; zoom: number; markers: DynamicMarker[] }) {
  const map = useMap();

  useEffect(() => {
    console.log('🗺️ MapController effect with markers:', markers.length);

    // If we have multiple markers, fit bounds to show all
    if (markers.length > 1) {
      const bounds = L.latLngBounds(markers.map(m => [m.lat, m.lng]));
      console.log('📏 Fitting bounds for', markers.length, 'markers');
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 10 });
    } else {
      // Otherwise use the provided center and zoom
      console.log('🗺️ Setting view to:', { center, zoom });
      map.setView(center, zoom);
    }
  }, [map, center, zoom, markers]);

  return null;
}

function App() {
  const [mapCenter, setMapCenter] = useState<[number, number]>([30.2672, -97.7431]); // Austin, Texas
  const [mapZoom, setMapZoom] = useState(13);
  const [markerPosition, setMarkerPosition] = useState<[number, number]>([30.2672, -97.7431]);
  const [markerLabel, setMarkerLabel] = useState('Austin, Texas');
  const [dynamicMarkers, setDynamicMarkers] = useState<DynamicMarker[]>([]);

  const handleRecenterMap = (lat: number, lng: number, location: string) => {
    console.log('🎯 handleRecenterMap called:', { lat, lng, location });
    console.log('📌 Current map center:', mapCenter);
    setMapCenter([lat, lng]);
    setMarkerPosition([lat, lng]);
    setMarkerLabel(location);
    console.log('✅ Map state updated to:', [lat, lng]);
  };

  const handleSetZoom = (zoom: number) => {
    const clampedZoom = Math.max(1, Math.min(18, zoom));
    console.log('🔍 handleSetZoom called:', { requested: zoom, clamped: clampedZoom });
    console.log('📌 Current zoom:', mapZoom);
    setMapZoom(clampedZoom);
    console.log('✅ Zoom updated to:', clampedZoom);
  };

  const handleAddMarker = (marker: DynamicMarker) => {
    console.log('📍 Adding marker:', marker);
    setDynamicMarkers(prev => [...prev, marker]);
  };

  const handleClearMarkers = () => {
    console.log('🗑️ Clearing all markers');
    setDynamicMarkers([]);
  };

  const handleUpdateMarker = (name: string, updates: Partial<DynamicMarker>) => {
    console.log('🔄 Updating marker:', name, updates);
    setDynamicMarkers(prev => prev.map(marker => {
      if (marker.name === name) {
        // Merge updates into existing marker
        return {
          ...marker,
          ...updates,
          // Deep merge additionalInfo
          additionalInfo: {
            ...marker.additionalInfo,
            ...updates.additionalInfo
          },
          // Deep merge satelliteInfo
          satelliteInfo: {
            ...marker.satelliteInfo,
            ...updates.satelliteInfo
          }
        };
      }
      return marker;
    }));
  };

  return (
    <div className="app">
      <NotificationCenter />
      <header>
        <h1>SkyFi MCP - Satellite Imagery Platform</h1>
      </header>

      <main>
        <MapContainer
          center={mapCenter}
          zoom={mapZoom}
          style={{ height: '600px', width: '100%' }}
        >
          <MapController center={mapCenter} zoom={mapZoom} markers={dynamicMarkers} />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Single location marker */}
          {dynamicMarkers.length === 0 && (
            <Marker position={markerPosition}>
              <Popup>
                {markerLabel}
              </Popup>
            </Marker>
          )}

          {/* Dynamic markers from AI */}
          {dynamicMarkers.map((marker) => (
            <Marker key={marker.id} position={[marker.lat, marker.lng]}>
              <Tooltip permanent={false} direction="top" offset={[0, -10]}>
                <strong>{marker.name}</strong>
              </Tooltip>
              <Popup maxWidth={350}>
                <div style={{ padding: '10px' }}>
                  <h3 style={{ margin: '0 0 10px 0', color: '#2c3e50' }}>{marker.name}</h3>
                  {marker.category && (
                    <p style={{ margin: '5px 0', fontSize: '14px' }}><strong>Type:</strong> {marker.category}</p>
                  )}
                  <p style={{ margin: '5px 0', fontSize: '14px' }}>{marker.description}</p>

                  {marker.additionalInfo && Object.keys(marker.additionalInfo).length > 0 && (
                    <div style={{ marginTop: '10px', padding: '10px', background: '#f0f0f0', borderRadius: '5px' }}>
                      {Object.entries(marker.additionalInfo).map(([key, value]) => (
                        <p key={key} style={{ margin: '5px 0', fontSize: '13px' }}>
                          <strong>{key.charAt(0).toUpperCase() + key.slice(1)}:</strong>{' '}
                          {Array.isArray(value) ? value.join(', ') : String(value)}
                        </p>
                      ))}
                    </div>
                  )}

                  {marker.satelliteInfo && (
                    <div style={{ marginTop: '10px', padding: '10px', background: '#e8f5e9', borderRadius: '5px' }}>
                      <p style={{ margin: '5px 0', fontSize: '13px', fontWeight: 'bold', color: marker.satelliteInfo.available ? '#2e7d32' : '#c62828' }}>
                        {marker.satelliteInfo.available ? '✓ Satellite Imagery Available' : '✗ Satellite Imagery Unavailable'}
                      </p>
                      {marker.satelliteInfo.available && marker.satelliteInfo.estimatedCost && (
                        <>
                          <p style={{ margin: '5px 0', fontSize: '13px' }}><strong>Est. Cost:</strong> {marker.satelliteInfo.estimatedCost}</p>
                          {marker.satelliteInfo.resolution && (
                            <p style={{ margin: '5px 0', fontSize: '13px' }}><strong>Resolution:</strong> {marker.satelliteInfo.resolution}</p>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </main>
      <Chatbot
        onRecenterMap={handleRecenterMap}
        onSetZoom={handleSetZoom}
        onAddMarker={handleAddMarker}
        onClearMarkers={handleClearMarkers}
        onUpdateMarker={handleUpdateMarker}
      />
    </div>
  );
}

export default App;
