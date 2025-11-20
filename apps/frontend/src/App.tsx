import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { isValidCoordinate } from '@skyfi-mcp/shared';

function App() {
  const defaultPosition: [number, number] = [37.7749, -122.4194]; // San Francisco

  return (
    <div className="app">
      <header>
        <h1>SkyFi MCP - Satellite Imagery Platform</h1>
      </header>

      <main>
        <MapContainer
          center={defaultPosition}
          zoom={13}
          style={{ height: '600px', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker position={defaultPosition}>
            <Popup>
              San Francisco, CA
            </Popup>
          </Marker>
        </MapContainer>
      </main>
    </div>
  );
}

export default App;
