// Backend API server for SkyFi MCP web interface
import express from 'express';
import cors from 'cors';
import { isValidCoordinate } from '@skyfi-mcp/shared';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Example API endpoint
app.post('/api/validate-coordinates', (req, res) => {
  const { latitude, longitude } = req.body;

  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return res.status(400).json({ error: 'Invalid coordinates' });
  }

  const valid = isValidCoordinate(latitude, longitude);
  res.json({ valid, latitude, longitude });
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
