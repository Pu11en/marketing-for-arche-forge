# API Contract: AI Video System

**Feature**: 001-ai-video-html  
**Date**: 2025-11-07  
**Version**: 1.0.0  
**Base URL**: `https://api.aivideosystem.com/v1`

## Authentication

All API requests require authentication using Bearer tokens:

```
Authorization: Bearer <JWT_TOKEN>
```

## Response Format

All responses follow this structure:

```json
{
  "success": true,
  "data": {},
  "error": null,
  "timestamp": "2025-11-07T00:00:00Z"
}
```

Error responses:

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message",
    "details": {}
  },
  "timestamp": "2025-11-07T00:00:00Z"
}
```

## User Management

### Register User

**POST** `/auth/register`

**Request Body**:
```json
{
  "email": "user@example.com",
  "username": "username",
  "password": "password123"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "username": "username",
      "subscriptionTier": "FREE",
      "storageUsed": 0,
      "storageLimit": 1073741824
    },
    "token": "jwt_token"
  }
}
```

### Login User

**POST** `/auth/login`

**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "username": "username",
      "subscriptionTier": "FREE",
      "storageUsed": 0,
      "storageLimit": 1073741824
    },
    "token": "jwt_token"
  }
}
```

### Get User Profile

**GET** `/users/profile`

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "username": "username",
    "subscriptionTier": "FREE",
    "storageUsed": 0,
    "storageLimit": 1073741824,
    "createdAt": "2025-11-07T00:00:00Z"
  }
}
```

## Video Projects

### Create Project

**POST** `/projects`

**Request Body**:
```json
{
  "title": "My Video Project",
  "description": "Project description",
  "settings": {}
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "My Video Project",
    "description": "Project description",
    "status": "DRAFT",
    "settings": {},
    "createdAt": "2025-11-07T00:00:00Z",
    "updatedAt": "2025-11-07T00:00:00Z"
  }
}
```

### Get Projects

**GET** `/projects`

**Query Parameters**:
- `page` (integer, default: 1)
- `limit` (integer, default: 10)
- `status` (string, optional): Filter by status

**Response**:
```json
{
  "success": true,
  "data": {
    "projects": [
      {
        "id": "uuid",
        "title": "My Video Project",
        "description": "Project description",
        "status": "DRAFT",
        "createdAt": "2025-11-07T00:00:00Z",
        "updatedAt": "2025-11-07T00:00:00Z",
        "clipCount": 0
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 1,
      "totalPages": 1
    }
  }
}
```

### Get Project Details

**GET** `/projects/{projectId}`

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "My Video Project",
    "description": "Project description",
    "status": "DRAFT",
    "settings": {},
    "createdAt": "2025-11-07T00:00:00Z",
    "updatedAt": "2025-11-07T00:00:00Z",
    "clips": []
  }
}
```

## Video Generation

### Generate Video

**POST** `/generate/video`

**Request Body**:
```json
{
  "projectId": "uuid",
  "prompt": "A beautiful sunset over mountains",
  "parameters": {
    "duration": 15,
    "resolution": "1920x1080",
    "style": "realistic"
  }
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "jobId": "uuid",
    "status": "QUEUED",
    "estimatedTime": 30
  }
}
```

### Get Generation Status

**GET** `/generate/status/{jobId}`

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "PROCESSING",
    "progress": 45,
    "startedAt": "2025-11-07T00:00:00Z",
    "estimatedCompletion": "2025-11-07T00:00:30Z"
  }
}
```

### Get Generated Clip

**GET** `/generate/clip/{clipId}`

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "Generated Clip",
    "duration": 15.5,
    "fileUrl": "https://s3.amazonaws.com/bucket/clip.mp4",
    "thumbnailUrl": "https://s3.amazonaws.com/bucket/thumbnail.jpg",
    "fileSize": 52428800,
    "resolution": "1920x1080",
    "format": "mp4",
    "createdAt": "2025-11-07T00:00:00Z"
  }
}
```

## Templates

### Get Templates

**GET** `/templates`

**Query Parameters**:
- `page` (integer, default: 1)
- `limit` (integer, default: 10)
- `category` (string, optional): Filter by category

**Response**:
```json
{
  "success": true,
  "data": {
    "templates": [
      {
        "id": "uuid",
        "name": "Nature Scene",
        "description": "Beautiful nature template",
        "category": "nature",
        "thumbnailUrl": "https://s3.amazonaws.com/bucket/thumb.jpg",
        "isPublic": true,
        "usageCount": 150
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 1,
      "totalPages": 1
    }
  }
}
```

### Use Template

**POST** `/templates/{templateId}/use`

**Request Body**:
```json
{
  "projectId": "uuid",
  "customizations": {
    "text": "Custom text",
    "color": "#FF0000"
  }
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "jobId": "uuid",
    "status": "QUEUED",
    "estimatedTime": 20
  }
}
```

## Error Codes

| Code | Description |
|------|-------------|
| AUTH_001 | Invalid credentials |
| AUTH_002 | Token expired |
| AUTH_003 | Insufficient permissions |
| USER_001 | User not found |
| USER_002 | Email already exists |
| USER_003 | Username already exists |
| PROJ_001 | Project not found |
| PROJ_002 | Insufficient storage |
| GEN_001 | Generation failed |
| GEN_002 | Invalid prompt |
| TEMP_001 | Template not found |
| SYS_001 | Internal server error |
| SYS_002 | Service unavailable |

## Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| POST /generate/video | 10 requests | 1 hour |
| GET /templates | 100 requests | 1 hour |
| All other endpoints | 1000 requests | 1 hour |

## Webhooks

### Generation Complete

**POST** to webhook URL configured in user settings

**Payload**:
```json
{
  "event": "generation.complete",
  "data": {
    "jobId": "uuid",
    "clipId": "uuid",
    "status": "COMPLETED",
    "timestamp": "2025-11-07T00:00:00Z"
  }
}
```

### Generation Failed

**POST** to webhook URL configured in user settings

**Payload**:
```json
{
  "event": "generation.failed",
  "data": {
    "jobId": "uuid",
    "error": "Generation failed due to invalid prompt",
    "timestamp": "2025-11-07T00:00:00Z"
  }
}