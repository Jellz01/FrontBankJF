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
