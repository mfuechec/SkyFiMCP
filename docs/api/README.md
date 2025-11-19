# SkyFi MCP API Reference

Complete reference for all available MCP tools.

## Tools Overview

| Tool | Description |
|------|-------------|
| [search_archive](#search_archive) | Search for existing satellite imagery |
| [get_pricing_estimate](#get_pricing_estimate) | Get pricing for imagery |
| [check_order_feasibility](#check_order_feasibility) | Check if an order is feasible |
| [place_order](#place_order) | Place an order with confirmation |
| [get_order_status](#get_order_status) | Check order status |
| [cancel_order](#cancel_order) | Cancel a pending order |
| [list_orders](#list_orders) | List all orders |
| [poll_order_status](#poll_order_status) | Poll until order completes |
| [create_monitor](#create_monitor) | Create AOI monitor |
| [list_monitors](#list_monitors) | List all monitors |
| [get_monitor](#get_monitor) | Get monitor details |
| [delete_monitor](#delete_monitor) | Delete a monitor |
| [pause_monitor](#pause_monitor) | Pause a monitor |
| [resume_monitor](#resume_monitor) | Resume a paused monitor |

---

## Archive Search

### search_archive

Search for existing satellite imagery in the SkyFi archive.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| apiKey | string | Yes | SkyFi API key |
| location | string or GeoJSON | Yes | Location to search (address, coordinates, or GeoJSON) |
| dateRange | object | No | `{start: string, end: string}` in ISO 8601 format |
| resolution | string | No | Minimum resolution (e.g., "0.5m", "1m") |
| imageType | string | No | "optical", "sar", "multispectral", "hyperspectral" |
| openDataOnly | boolean | No | Only return free imagery |
| limit | number | No | Max results to return |

**Example:**

```json
{
  "apiKey": "your-api-key",
  "location": "San Francisco, CA",
  "dateRange": {
    "start": "2024-01-01",
    "end": "2024-12-31"
  },
  "resolution": "1m",
  "imageType": "optical",
  "limit": 10
}
```

**Response:**

```json
{
  "success": true,
  "results": [
    {
      "id": "img_abc123",
      "provider": "Maxar",
      "captureDate": "2024-06-15T10:30:00Z",
      "resolution": "0.5m",
      "imageType": "optical",
      "price": 45.00,
      "currency": "USD",
      "previewUrl": "https://...",
      "cloudCoverage": 5
    }
  ],
  "total": 25,
  "hasMore": true
}
```

---

## Pricing & Feasibility

### get_pricing_estimate

Get pricing estimate for imagery.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| apiKey | string | Yes | SkyFi API key |
| imageId | string | Conditional | ID of archive imagery (use this OR taskingRequest) |
| taskingRequest | object | Conditional | Request for new capture |

**taskingRequest object:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| location | GeoJSON | Yes | Point or Polygon |
| resolution | string | Yes | Desired resolution |
| captureDate | string | No | ISO 8601 date |
| imageType | string | No | Type of imagery |

**Example:**

```json
{
  "apiKey": "your-api-key",
  "imageId": "img_abc123"
}
```

**Response:**

```json
{
  "success": true,
  "pricing": {
    "price": 45.00,
    "currency": "USD",
    "provider": "Maxar",
    "estimatedDelivery": "30 minutes",
    "breakdown": {
      "basePrice": 40.00,
      "processingFee": 5.00
    }
  }
}
```

### check_order_feasibility

Check if an order can be fulfilled.

**Parameters:** Same as `get_pricing_estimate`

**Response:**

```json
{
  "success": true,
  "feasibility": {
    "feasible": true,
    "message": "Order is feasible and can be processed"
  }
}
```

Or if not feasible:

```json
{
  "success": true,
  "feasibility": {
    "feasible": false,
    "reason": "Requested resolution not available",
    "detailedExplanation": "The requested resolution is not available for this location",
    "suggestions": [
      "Try a different resolution (e.g., 1m instead of 0.5m)",
      "Consider using a different imagery provider"
    ],
    "alternatives": ["Try 1m resolution"]
  }
}
```

---

## Order Management

### place_order

Place an order for satellite imagery. Requires a confirmation token.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| apiKey | string | Yes | SkyFi API key |
| userConfirmationToken | string | Yes | Confirmation token |
| imageId | string | Conditional | Archive image ID |
| taskingRequest | object | Conditional | New capture request |
| deliveryOptions | object | No | Delivery preferences |

**deliveryOptions object:**

| Name | Type | Description |
|------|------|-------------|
| cloudStorage | string | S3/GCS path (e.g., "s3://bucket/path") |
| format | string | Output format ("geotiff", "jp2", "png") |

**Example:**

```json
{
  "apiKey": "your-api-key",
  "userConfirmationToken": "confirm_abc123",
  "imageId": "img_abc123",
  "deliveryOptions": {
    "format": "geotiff"
  }
}
```

**Response:**

```json
{
  "success": true,
  "order": {
    "id": "order_xyz789",
    "status": "pending",
    "price": 45.00,
    "currency": "USD",
    "createdAt": "2025-01-15T10:00:00Z",
    "estimatedDelivery": "30 minutes",
    "message": "Order order_xyz789 has been placed successfully"
  }
}
```

### get_order_status

Check the status of an order.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| apiKey | string | Yes | SkyFi API key |
| orderId | string | Yes | Order ID |

**Response:**

```json
{
  "success": true,
  "order": {
    "id": "order_xyz789",
    "status": "completed",
    "price": 45.00,
    "currency": "USD",
    "progress": 100,
    "downloadUrls": [
      "https://downloads.skyfi.com/order_xyz789/image.tif"
    ],
    "statusDescription": "Order is complete and imagery is available for download"
  }
}
```

### cancel_order

Cancel a pending or processing order.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| apiKey | string | Yes | SkyFi API key |
| orderId | string | Yes | Order ID to cancel |

### list_orders

List all orders with optional filtering.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| apiKey | string | Yes | SkyFi API key |
| limit | number | No | Max results (default: 20) |
| offset | number | No | Pagination offset |
| status | string | No | Filter by status |
| dateRange | object | No | Filter by date |

### poll_order_status

Poll an order until it reaches a terminal state.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| apiKey | string | Yes | SkyFi API key |
| orderId | string | Yes | Order ID to poll |
| maxAttempts | number | No | Max polls (default: 10, max: 100) |
| intervalSeconds | number | No | Seconds between polls (default: 30, range: 5-300) |

**Response:**

```json
{
  "success": true,
  "completed": true,
  "order": {
    "id": "order_xyz789",
    "status": "completed",
    "downloadUrls": ["https://..."]
  },
  "polling": {
    "attempts": 3,
    "maxAttempts": 10,
    "intervalSeconds": 30,
    "statusHistory": [
      {"status": "pending", "timestamp": "...", "progress": 0},
      {"status": "processing", "timestamp": "...", "progress": 50},
      {"status": "completed", "timestamp": "...", "progress": 100}
    ]
  }
}
```

---

## AOI Monitoring

### create_monitor

Create a monitor for an area of interest.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| apiKey | string | Yes | SkyFi API key |
| location | GeoJSON | Yes | Point or Polygon to monitor |
| webhookUrl | string | Yes | URL for notifications |
| resolution | string | No | Minimum resolution |
| imageType | string | No | Type of imagery |
| frequency | string | No | Check frequency ("daily", "weekly") |
| notifyOnNewImagery | boolean | No | Notify on new imagery (default: true) |
| notifyOnPriceChange | boolean | No | Notify on price changes |

**Example:**

```json
{
  "apiKey": "your-api-key",
  "location": {
    "type": "Point",
    "coordinates": [-122.4194, 37.7749]
  },
  "webhookUrl": "https://example.com/webhook",
  "resolution": "1m",
  "frequency": "daily"
}
```

**Response:**

```json
{
  "success": true,
  "monitor": {
    "id": "mon_abc123",
    "status": "active",
    "location": {...},
    "criteria": {"resolution": "1m"},
    "webhookUrl": "https://example.com/webhook",
    "createdAt": "2025-01-15T10:00:00Z",
    "message": "Monitor mon_abc123 created successfully"
  }
}
```

### list_monitors

List all monitors.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| apiKey | string | Yes | SkyFi API key |

### get_monitor

Get details of a specific monitor.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| apiKey | string | Yes | SkyFi API key |
| monitorId | string | Yes | Monitor ID |

### delete_monitor

Delete a monitor permanently.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| apiKey | string | Yes | SkyFi API key |
| monitorId | string | Yes | Monitor ID |

### pause_monitor

Pause an active monitor.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| apiKey | string | Yes | SkyFi API key |
| monitorId | string | Yes | Monitor ID |

### resume_monitor

Resume a paused monitor.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| apiKey | string | Yes | SkyFi API key |
| monitorId | string | Yes | Monitor ID |

---

## Error Handling

All tools return errors in a consistent format:

```json
{
  "error": "ERROR_CODE",
  "message": "Human-readable error message",
  "statusCode": 400,
  "details": {...},
  "troubleshooting": {
    "possibleCauses": ["..."],
    "suggestions": ["..."]
  }
}
```

### Common Error Codes

| Code | Description |
|------|-------------|
| AUTH_INVALID | Invalid or expired API key |
| NOT_FOUND | Resource not found |
| INVALID_REQUEST | Invalid parameters |
| INSUFFICIENT_FUNDS | Account balance too low |
| RATE_LIMITED | Too many requests |
| INVALID_TOKEN | Confirmation token invalid |

---

## GeoJSON Reference

### Point

```json
{
  "type": "Point",
  "coordinates": [-122.4194, 37.7749]
}
```

Note: Coordinates are `[longitude, latitude]`

### Polygon

```json
{
  "type": "Polygon",
  "coordinates": [[
    [-122.5, 37.7],
    [-122.4, 37.7],
    [-122.4, 37.8],
    [-122.5, 37.8],
    [-122.5, 37.7]
  ]]
}
```

Note: First and last coordinates must be identical to close the polygon.
