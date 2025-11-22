import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Rectangle, Marker, Popup, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import { Chatbot } from './components/Chatbot';
import { NotificationCenter } from './components/NotificationToast';
import L from 'leaflet';

export interface AOIRectangle {
  id: string;
  name: string;
  bounds: [[number, number], [number, number]]; // [[south, west], [north, east]]
  description: string;
  category?: string;
  additionalInfo?: Record<string, any>;
  satelliteInfo?: {
    available?: boolean;
    estimatedCost?: string;
    resolution?: string;
    monitoringActive?: boolean;
  };
}

export interface OSMFeatureMarker {
  id: string;
  name: string;
  type: string;
  lat: number;
  lon: number;
  tags: Record<string, string>;
  featureType?: string;
}

// Fix leaflet default icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Component to handle map updates
function MapController({ center, zoom, rectangles }: { center: [number, number]; zoom: number; rectangles: AOIRectangle[] }) {
  const map = useMap();

  useEffect(() => {
    console.log('🗺️ MapController effect with rectangles:', rectangles.length);

    // If we have rectangles, fit bounds to show all
    if (rectangles.length > 0) {
      const allBounds = rectangles.map(r => r.bounds);
      // Create initial bounds from first rectangle's [southwest, northeast] coordinates
      const combinedBounds = L.latLngBounds(allBounds[0][0], allBounds[0][1]);
      // Extend to include all other rectangles
      allBounds.slice(1).forEach(b => combinedBounds.extend(L.latLngBounds(b[0], b[1])));

      console.log('📏 Fitting bounds for', rectangles.length, 'rectangles');
      map.fitBounds(combinedBounds, { padding: [50, 50], maxZoom: 10 });
    } else {
      // Otherwise use the provided center and zoom
      console.log('🗺️ Setting view to:', { center, zoom });
      map.setView(center, zoom);
    }
  }, [map, center, zoom, rectangles]);

  return null;
}

function App() {
  const [mapCenter, setMapCenter] = useState<[number, number]>([30.2672, -97.7431]); // Austin, Texas
  const [mapZoom, setMapZoom] = useState(13);
  const [rectangles, setRectangles] = useState<AOIRectangle[]>([]);
  const [osmFeatures, setOsmFeatures] = useState<OSMFeatureMarker[]>([]);

  const handleRecenterMap = (lat: number, lng: number, location: string) => {
    console.log('🎯 handleRecenterMap called:', { lat, lng, location });
    setMapCenter([lat, lng]);
  };

  const handleSetZoom = (zoom: number) => {
    const clampedZoom = Math.max(1, Math.min(18, zoom));
    console.log('🔍 handleSetZoom called:', { requested: zoom, clamped: clampedZoom });
    setMapZoom(clampedZoom);
  };

  const handleDrawRectangle = (rectangle: AOIRectangle) => {
    console.log('📐 Adding rectangle:', rectangle);
    setRectangles(prev => [...prev, rectangle]);
  };

  const handleClearRectangles = () => {
    console.log('🗑️ Clearing all rectangles');
    setRectangles([]);
  };

  const handleUpdateRectangle = (name: string, updates: Partial<AOIRectangle>) => {
    console.log('🔄 Updating rectangle:', name, updates);
    setRectangles(prev => prev.map(rectangle => {
      if (rectangle.name === name) {
        // Merge updates into existing rectangle
        return {
          ...rectangle,
          ...updates,
          // Deep merge additionalInfo
          additionalInfo: {
            ...rectangle.additionalInfo,
            ...updates.additionalInfo
          },
          // Deep merge satelliteInfo
          satelliteInfo: {
            ...rectangle.satelliteInfo,
            ...updates.satelliteInfo
          }
        };
      }
      return rectangle;
    }));
  };

  const handleDrawOsmFeatures = (features: OSMFeatureMarker[]) => {
    console.log('📍 Adding OSM features:', features.length);
    setOsmFeatures(prev => [...prev, ...features]);
  };

  const handleClearOsmFeatures = () => {
    console.log('🗑️ Clearing all OSM features');
    setOsmFeatures([]);
  };

  const handleHighlightOsmFeature = (featureId: string) => {
    console.log('✨ Highlighting OSM feature:', featureId);
    const feature = osmFeatures.find(f => f.id === featureId);
    if (feature) {
      setMapCenter([feature.lat, feature.lon]);
      setMapZoom(16);
    }
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
          <MapController center={mapCenter} zoom={mapZoom} rectangles={rectangles} />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Draw OSM feature markers */}
          {osmFeatures.map((feature) => (
            <Marker
              key={feature.id}
              position={[feature.lat, feature.lon]}
            >
              <Popup maxWidth={350}>
                <div style={{ padding: '10px' }}>
                  <h3 style={{ margin: '0 0 10px 0', color: '#2c3e50' }}>{feature.name}</h3>
                  <p style={{ margin: '5px 0', fontSize: '14px' }}>
                    <strong>Type:</strong> {feature.featureType || feature.type}
                  </p>
                  <div style={{ marginTop: '10px', padding: '8px', background: '#f8f8f8', borderRadius: '3px', fontSize: '12px', fontFamily: 'monospace' }}>
                    <strong>Coordinates:</strong><br/>
                    Lat: {feature.lat.toFixed(6)}, Lon: {feature.lon.toFixed(6)}
                  </div>
                  {Object.keys(feature.tags).length > 0 && (
                    <div style={{ marginTop: '10px', padding: '10px', background: '#f0f0f0', borderRadius: '5px', maxHeight: '150px', overflowY: 'auto' }}>
                      <strong>Tags:</strong>
                      {Object.entries(feature.tags).slice(0, 10).map(([key, value]) => (
                        <p key={key} style={{ margin: '5px 0', fontSize: '12px' }}>
                          <strong>{key}:</strong> {value}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </Popup>
              <Tooltip direction="top" offset={[0, -20]}>
                {feature.name}
              </Tooltip>
            </Marker>
          ))}

          {/* Draw rectangles (AOIs) */}
          {rectangles.map((rectangle) => {
            const bounds: L.LatLngBoundsExpression = [
              [rectangle.bounds[0][0], rectangle.bounds[0][1]], // southwest
              [rectangle.bounds[1][0], rectangle.bounds[1][1]]  // northeast
            ];

            return (
              <Rectangle
                key={rectangle.id}
                bounds={bounds}
                pathOptions={{
                  color: rectangle.satelliteInfo?.monitoringActive ? '#ff7800' : '#3388ff',
                  fillColor: rectangle.satelliteInfo?.monitoringActive ? '#ff7800' : '#3388ff',
                  fillOpacity: 0.2,
                  weight: 2
                }}
              >
                <Tooltip permanent={false} direction="top">
                  <strong>{rectangle.name}</strong>
                </Tooltip>
                <Popup maxWidth={350}>
                  <div style={{ padding: '10px' }}>
                    <h3 style={{ margin: '0 0 10px 0', color: '#2c3e50' }}>{rectangle.name}</h3>
                    {rectangle.category && (
                      <p style={{ margin: '5px 0', fontSize: '14px' }}><strong>Type:</strong> {rectangle.category}</p>
                    )}
                    <p style={{ margin: '5px 0', fontSize: '14px' }}>{rectangle.description}</p>

                    <div style={{ marginTop: '10px', padding: '8px', background: '#f8f8f8', borderRadius: '3px', fontSize: '12px', fontFamily: 'monospace' }}>
                      <strong>Coordinates:</strong><br/>
                      SW: {rectangle.bounds[0][0].toFixed(4)}, {rectangle.bounds[0][1].toFixed(4)}<br/>
                      NE: {rectangle.bounds[1][0].toFixed(4)}, {rectangle.bounds[1][1].toFixed(4)}
                    </div>

                    {rectangle.additionalInfo && Object.keys(rectangle.additionalInfo).length > 0 && (
                      <div style={{ marginTop: '10px', padding: '10px', background: '#f0f0f0', borderRadius: '5px' }}>
                        {Object.entries(rectangle.additionalInfo).map(([key, value]) => (
                          <p key={key} style={{ margin: '5px 0', fontSize: '13px' }}>
                            <strong>{key.charAt(0).toUpperCase() + key.slice(1)}:</strong>{' '}
                            {Array.isArray(value) ? value.join(', ') : String(value)}
                          </p>
                        ))}
                      </div>
                    )}

                    {rectangle.satelliteInfo && (
                      <div style={{ marginTop: '10px', padding: '10px', background: '#e8f5e9', borderRadius: '5px' }}>
                        <p style={{ margin: '5px 0', fontSize: '13px', fontWeight: 'bold', color: rectangle.satelliteInfo.available ? '#2e7d32' : '#c62828' }}>
                          {rectangle.satelliteInfo.available ? '✓ Satellite Imagery Available' : '✗ Satellite Imagery Unavailable'}
                        </p>
                        {rectangle.satelliteInfo.monitoringActive && (
                          <p style={{ margin: '5px 0', fontSize: '13px', color: '#ff7800', fontWeight: 'bold' }}>
                            📡 Monitoring Active
                          </p>
                        )}
                        {rectangle.satelliteInfo.available && rectangle.satelliteInfo.estimatedCost && (
                          <>
                            <p style={{ margin: '5px 0', fontSize: '13px' }}><strong>Est. Cost:</strong> {rectangle.satelliteInfo.estimatedCost}</p>
                            {rectangle.satelliteInfo.resolution && (
                              <p style={{ margin: '5px 0', fontSize: '13px' }}><strong>Resolution:</strong> {rectangle.satelliteInfo.resolution}</p>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </Popup>
              </Rectangle>
            );
          })}
        </MapContainer>
      </main>
      <Chatbot
        onRecenterMap={handleRecenterMap}
        onSetZoom={handleSetZoom}
        onDrawRectangle={handleDrawRectangle}
        onClearRectangles={handleClearRectangles}
        onUpdateRectangle={handleUpdateRectangle}
        onDrawOsmFeatures={handleDrawOsmFeatures}
        onClearOsmFeatures={handleClearOsmFeatures}
        onHighlightOsmFeature={handleHighlightOsmFeature}
      />
    </div>
  );
}

export default App;
