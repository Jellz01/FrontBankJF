# JFBS - Joseph Fabian Banking System

This project sets up a banking system with a React frontend, Node.js backend API, PostgreSQL database with replication, and Nginx as a load balancer and static file server, all orchestrated with Docker Compose.

## Project Structure

```
.
├── docker-compose.yml
├── README.md
├── backend/
│   ├── Dockerfile.backend
│   ├── package.json
│   └── src/
│       └── app.js
├── db_primary_config/
│   └── pg_hba.conf
├── frontend/
│   ├── Dockerfile.frontend
│   ├── package-lock.json
│   ├── package.json
│   ├── build/
│   └── src/
│       ├── App.css
│       ├── App.js
│       ├── index.css
│       ├── index.js
│       └── reportWebVitals.js
└── nginx/
    ├── Dockerfile.nginx
    ├── index.html
    └── nginx.conf
```

## Getting Started

### Prerequisites

*   Docker Desktop (or Docker Engine and Docker Compose) installed on your system.

### Setup and Run

1.  **Navigate to the project root directory:**
    ```bash
    cd /home/jellz/Documents/fallos2.0
    ```

2.  **Build and start the Docker containers:**
    This command will build the necessary Docker images (including the frontend within the Nginx image) and start all services in detached mode.
    ```bash
    docker-compose up --build -d
    ```

3.  **Verify all containers are running:**
    ```bash
    docker ps
    ```
    You should see `fallos20-nginx-1`, `fallos20-app1-1`, `fallos20-app2-1`, `fallos20-app3-1`, `fallos20-db_primary-1`, and `fallos20-db_replica-1` listed with `Up` status.

## Component Verification

This section provides commands and steps to verify the functionality of each part of the system.

### 1. Load Balancer (Nginx)

Nginx acts as both a static file server for the React frontend and a reverse proxy/load balancer for the backend API.

*   **Verify Nginx container is running:**
    ```bash
    docker ps --filter "name=nginx"
    ```
    Expected output: Nginx container listed with `Up` status and port `80` mapped.

*   **Access the Frontend Application:**
    Open your web browser and navigate to:
    ```
    http://localhost
    ```
    You should see the "JFBS - Joseph Fabian Banking System" React application. If you see the React app, Nginx is successfully serving the frontend.

*   **Test Load Balancing (Optional - Requires a backend endpoint that identifies the server):**
    If your backend had an endpoint (e.g., `/api/whoami`) that returned the ID of the server processing the request, you could test load balancing by repeatedly accessing it. Since your `nginx.conf` uses a default round-robin strategy, requests should be distributed among `app1`, `app2`, and `app3`.

### 2. Application Node Cluster (`app1`, `app2`, `app3`)

These are your Node.js backend API instances.

*   **Verify all application containers are running:**
    ```bash
    docker ps --filter "name=app"
    ```
    Expected output: All three `app` containers (`fallos20-app1-1`, `fallos20-app2-1`, `fallos20-app3-1`) listed with `Up` status.

*   **Test API Functionality:**
    Interact with the frontend application (e.g., create a new account, list accounts). If these operations are successful, it confirms that the backend API nodes are correctly processing requests and interacting with the database.

### 3. Database System with Replication (`db_primary`, `db_replica`)

This setup includes a PostgreSQL primary database and a streaming replica.

*   **Verify both database containers are running and healthy:**
    ```bash
    docker ps --filter "name=db"
    ```
    Expected output: Both `fallos20-db_primary-1` and `fallos20-db_replica-1` should be listed with `Up (healthy)` status. The `(healthy)` status indicates that their internal health checks are passing.

*   **Verify Database Replication (Manual Check):**
    1.  **Connect to the Primary Database:**
        ```bash
        docker exec -it fallos20-db_primary-1 psql -U user -d jbs_db
        ```
    2.  **Check Replication Status on Primary (inside `psql`):**
        ```sql
        SELECT * FROM pg_stat_replication;
        ```
        You should see at least one row indicating the replica (`db_replica`) is connected and actively streaming.
    3.  **Insert Data into Primary (inside `psql`):**
        ```sql
        INSERT INTO accounts (name, balance) VALUES ('Replication Test Account', 500.00);
        ```
    4.  **Exit Primary `psql`:**
        ```sql
        \q
        ```
    5.  **Connect to the Replica Database (in a new terminal):**
        ```bash
        docker exec -it fallos20-db_replica-1 psql -U user -d jbs_db
        ```
    6.  **Query Data from Replica (inside `psql`):**
        ```sql
        SELECT * FROM accounts WHERE name = 'Replication Test Account';
        ```
        You should see the "Replication Test Account" that you just inserted into the primary. This confirms that data is being replicated from the primary to the replica.
    7.  **Exit Replica `psql`:**
        ```sql
        \q
        ```

### 4. Active Monitoring (Health Checks)

Health checks are configured in `docker-compose.yml` for the database services.

*   **Check Docker Compose Health Status:**
    ```bash
    docker-compose ps
    ```
    Look at the `STATUS` column for `db_primary` and `db_replica`. They should show `Up (healthy)`. This confirms that Docker Compose is actively monitoring their health based on the defined `healthcheck` commands.

*   **Backend App Health Checks (Nginx Upstream):**
    Nginx is configured with basic health checks for the backend app nodes (`max_fails`, `fail_timeout`). If an app node fails to respond, Nginx will mark it as down and stop sending traffic to it.

    **To simulate a failure and observe Nginx's behavior:**
    1.  **Stop one of the backend app containers:**
        ```bash
        docker stop fallos20-app1-1
        ```
    2.  **Access your frontend application (`http://localhost`):**
        The application should still be accessible and functional, as Nginx will route requests to the remaining healthy `app2` and `app3` containers. You might observe a slight delay for the first request after stopping the container as Nginx detects the failure.
    3.  **Start the stopped container again:**
        ```bash
        docker start fallos20-app1-1
        ```
        Nginx should eventually detect that `app1` is back online and resume sending traffic to it.

## Cleaning Up

To stop and remove all containers, networks, and volumes created by Docker Compose:

```bash
docker-compose down -v --rmi all
```
This command is useful for a clean slate, removing all images used by the services as well.