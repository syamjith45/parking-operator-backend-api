# Parking Operator API - Docker Setup Guide

This document outlines how to build and run the backend API using Docker. This is necessary for properly configuring the frontend to communicate with the containerized backend using the correct endpoints.

## Prerequisites
- Docker Desktop must be installed and running on your system.

## 1. Building the Docker Image
To package the Node.js API code and its dependencies into a Docker image, open your terminal in the `parking-operator-api` directory and run:

```bash
docker build -t parking-operator-api .
```

*Note: The image is configured to use `node:20-alpine` as base to prevent Supabase compatibility issues.*

## 2. Running the API Container
After the image has successfully built, start a container from it by running:

```bash
docker run -p 4000:4000 --env-file .env parking-operator-api
```

### Understanding the Flags:
- `-p 4000:4000`: This binds port 4000 on your local machine to port 4000 inside the Docker container.
- `--env-file .env`: This injects your local environment variables (like Database URLs, Supabase keys, JWT Secrets, etc.) into the container so the app can use them securely.

## 3. Connecting the Frontend
With the container running successfully on port 4000, your frontend application should be configured to target the following API endpoint:

**GraphQL Endpoint:**
```
http://localhost:4000/graphql
```

*Ensure that any Apollo Client or fetch configurations in the frontend use this exact URL to communicate with the containerized backend.*

## Checking Status
You can verify the containerized server is running by opening a browser or testing the health check endpoint:
```
http://localhost:4000/health
```
