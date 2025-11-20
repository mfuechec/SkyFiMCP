// Shared validation utilities

export function isValidLatitude(lat: number): boolean {
  return lat >= -90 && lat <= 90;
}

export function isValidLongitude(lon: number): boolean {
  return lon >= -180 && lon <= 180;
}

export function isValidCoordinate(lat: number, lon: number): boolean {
  return isValidLatitude(lat) && isValidLongitude(lon);
}
