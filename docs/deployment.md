# Phase 1 Deployment Smoke Test

Phase 1 prepares the hello services for deployment. Application features and production secrets are added in later phases.

## Local environment

1. Install Docker Desktop and start the Linux container engine.
2. From the repository root, run:

   ```bash
   docker compose up --build
   ```

3. Verify the endpoints:

   ```bash
   curl http://localhost:3001/api/health
   curl http://localhost:3001/api/health/ready
   ```

4. Open `http://localhost:3000` and confirm the frontend smoke page renders.

The backend health endpoint does not require dependencies. The readiness endpoint requires PostgreSQL and reports Redis as `degraded` if Redis is unavailable.

## Render backend

1. Push this repository to GitHub.
2. In Render, choose **New > Blueprint** and select the repository.
3. Review `render.yaml` before applying it. Render will provision the PostgreSQL database and build the backend Docker image.
4. Set these secret values in the Render dashboard:
   - `ACCESS_TOKEN_SECRET`
   - `REFRESH_TOKEN_SECRET`
   - `REDIS_URL`
   - `FRONTEND_ORIGIN`
5. Confirm the deploy health check succeeds at `/api/health`.

Do not commit production secret values. The `sync: false` entries intentionally require manual configuration.

## Vercel frontend

1. Import the repository into Vercel.
2. Set the project root directory to `frontend`.
3. Set:
   - `NEXT_PUBLIC_API_URL` to the deployed backend API URL, including `/api`
   - `NEXT_PUBLIC_WS_URL` to the deployed backend WebSocket URL
4. Deploy and open the generated Vercel URL.
5. Update the backend `FRONTEND_ORIGIN` to the exact Vercel origin and redeploy the backend.

The final cookie, WebSocket, and rewrite verification depends on the authentication and realtime phases. Phase 1 verifies only that both hello applications build and start.

## Validation performed

- Backend `npm run lint`: passes with warnings for console-based bootstrap logging.
- Backend `npm run build`: passes.
- Frontend `npm run lint`: passes.
- Frontend `npm run type-check`: passes.
- Frontend `npm run build`: passes.
- `docker compose config`: passes.
- `docker compose up --build`: requires Docker Desktop's Linux engine to be running.
