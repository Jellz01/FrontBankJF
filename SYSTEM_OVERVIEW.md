# System Overview and Feature Analysis

This document outlines how various high-availability and resilience features are implemented (or not implemented) within the JFBS project.

## 1. Failover Automático de Base de Datos (Automatic Database Failover)

**Status: Not Implemented (Manual Intervention Required)**

The current setup provides **database replication** between `db_primary` and `db_replica` using PostgreSQL's streaming replication. This ensures data redundancy and allows for a read-only replica. However, it **does not include automatic failover**.

*   **What's present:**
    *   `db_primary` (primary database) and `db_replica` (streaming replica) are defined in `docker-compose.yml`.
    *   `db_replica` is configured to follow `db_primary`.
    *   Data written to `db_primary` is asynchronously replicated to `db_replica`.

*   **What's missing for automatic failover:**
    *   A mechanism to automatically detect a failure of `db_primary`.
    *   A process to automatically promote `db_replica` to become the new primary.
    *   A way to automatically reconfigure the application nodes (`app1`, `app2`, `app3`) to connect to the newly promoted primary database.
    *   Tools like Patroni, repmgr, or pg_auto_failover are typically used to manage and automate PostgreSQL high-availability and failover.

*   **Current behavior in case of `db_primary` failure:**
    If `db_primary` becomes unavailable, the application will lose its ability to write data, and read operations will fail unless manually reconfigured to point to the replica (which would then need to be promoted).

## 2. Redundancia Activa-Pasiva o Activa-Activa

### Database Layer (Activa-Pasiva)

**Status: Active-Passive (Primary-Replica)**

*   **Implementation:**
    *   `db_primary` handles all read and write operations from the application.
    *   `db_replica` acts as a hot standby, continuously receiving changes from `db_primary`. It can serve read-only queries if explicitly configured, but the application currently only connects to `db_primary`.
*   **Location in Project:**
    *   Defined in `docker-compose.yml` under `services.db_primary` and `services.db_replica`.
    *   Replication configuration is handled by the PostgreSQL image's entrypoint and `pg_hba.conf`.

### Application Node Cluster (Activa-Activa)

**Status: Active-Active**

*   **Implementation:**
    *   Multiple instances of the backend application (`app1`, `app2`, `app3`) are running concurrently.
    *   Nginx distributes incoming requests across these instances.
*   **Location in Project:**
    *   Defined in `docker-compose.yml` under `services.app1`, `services.app2`, and `services.app3`.
    *   Nginx configuration in `nginx/nginx.conf` (`upstream backend_app`) defines these as backend servers.

## 3. Balanceo de Carga con Detección de Nodos Caídos

**Status: Implemented (Basic Detection)**

*   **Implementation:**
    *   Nginx acts as a load balancer for the backend application nodes.
    *   It uses a default round-robin strategy to distribute requests.
    *   Basic health checks are configured to detect unresponsive nodes.
*   **Location in Project:**
    *   **`nginx/nginx.conf`:**
        ```nginx
        upstream backend_app {
            server app1:3000;
            server app2:3000;
            server app3:3000;

            # Health checks: If a node does not respond, it is marked as down
            # max_fails: number of consecutive failures to mark as down
            # fail_timeout: time the node will be marked as down
            # (Nginx Plus tiene health checks más avanzados, esto es básico.)
        }

        server {
            listen 80;
            location /api/ {
                proxy_pass http://backend_app/;
                # ... other proxy settings ...
            }
        }
        ```
    *   Nginx will automatically stop sending requests to a backend server if it fails `max_fails` checks within `fail_timeout`.

## 4. Reintentos Automáticos y Timeouts Manejados en Código

**Status: Implemented (at Nginx, Backend, and Frontend levels)**

### Nginx (Proxy Layer)

*   **Implementation:**
    *   Nginx is configured to automatically retry requests to other upstream servers if the initial attempt fails due to certain errors (e.g., connection errors, timeouts, 5xx responses).
    *   Various timeouts are set for proxying requests.
*   **Location in Project:**
    *   **`nginx/nginx.conf`:**
        ```nginx
        location /api/ {
            proxy_pass http://backend_app/;
            proxy_connect_timeout 5s;
            proxy_send_timeout 5s;
            proxy_read_timeout 5s;

            # Error handling and retries (basic)
            proxy_next_upstream error timeout http_500 http_502 http_503 http_504;
            proxy_next_upstream_tries 3; # Retry up to 3 times on another upstream
            proxy_next_upstream_timeout 10s; # Tiempo total para reintentos
        }
        ```

### Backend Application (`backend/src/app.js`)

*   **Implementation:**
    *   A `retryOperation` helper function has been added to wrap database queries, providing automatic retries with exponential backoff for transient errors.
    *   The PostgreSQL connection pool (`pg`) also has built-in timeout configurations for establishing and managing database connections.
*   **Location in Project:**
    *   **`backend/src/app.js`:**
        ```javascript
        async function retryOperation(operation, maxRetries = 5, delay = 1000) { /* ... */ }

        // ... usage in app.post('/accounts') and app.get('/accounts')

        const pool = new Pool({
          // ...
          connectionTimeoutMillis: 5000, // 5 seconds to establish connection
          idleTimeoutMillis: 30000,    // 30 seconds to close idle connections
          max: 20                      // Max connections in the pool
        });
        ```

### Frontend Application (`frontend/src/App.js`)

*   **Implementation:**
    *   A `retryFetch` helper function has been added to wrap `fetch` calls, providing automatic retries with exponential backoff for network errors and server-side errors (HTTP 5xx).
    *   **Circuit Breaker Pattern:** Integrated into `retryFetch` to prevent cascading failures by temporarily stopping requests to a consistently failing backend.
    *   Uses `try...catch` blocks to handle network errors and API response errors.
*   **Location in Project:**
    *   **`frontend/src/App.js`:**
        ```javascript
        // Circuit Breaker Configuration
        const CIRCUIT_BREAKER_THRESHOLD = 3; // Number of consecutive failures before opening the circuit
        const CIRCUIT_BREAKER_TIMEOUT = 5000; // Time in ms to stay open before half-opening

        let circuitState = 'CLOSED';
        let failureCount = 0;
        let lastFailureTime = 0;

        async function retryFetch(url, options, maxRetries = 3, delay = 1000) { /* ... */ }

        // ... usage in fetchAccounts and createAccount
        ```

## 5. Rate Limiting (Nginx)

**Status: Implemented**

*   **Implementation:**
    *   Nginx is configured to limit the rate of requests to the `/api/` endpoint, protecting the backend from being overwhelmed.
*   **Location in Project:**
    *   **`nginx/nginx.conf`:**
        ```nginx
        http {
            # ...
            limit_req_zone $binary_remote_addr zone=apilimit:10m rate=1r/s;

            server {
                # ...
                location /api/ {
                    limit_req zone=apilimit burst=5 nodelay; # Apply rate limit
                    proxy_pass http://backend_app/;
                    # ...
                }
            }
        }
        ```
