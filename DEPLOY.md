# Deployment Guide for Alibaba Cloud

This guide will help you deploy your Next.js application to an Alibaba Cloud server using Docker.

## Prerequisites

1.  **Alibaba Cloud Server (ECS)**: Ensure you have access to your server (IP address, username, password/SSH key).
2.  **SSH Client**: Terminal (Mac/Linux) or PuTTY (Windows).

## Step 1: Connect to Your Server

Open your terminal and connect to your server:

```bash
ssh root@<your-server-ip>
```

Replace `<your-server-ip>` with your actual server IP address.

## Step 2: Install Docker & Docker Compose

Run the following commands on your server to install Docker:

```bash
# Update package index
sudo apt-get update

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Install Docker Compose (if not included in Docker installation)
sudo apt-get install docker-compose-plugin
```

Verify installation:

```bash
docker --version
docker compose version
```

## Step 3: Upload Your Project

You can upload your project files using `scp` (from your local machine) or `git clone` (if you push your code to a repository).

**Option A: Using Git (Recommended)**

1.  Push your code to GitHub/GitLab.
2.  On the server, clone the repository:
    ```bash
    git clone <your-repo-url>
    cd content-factory-web
    ```

**Option B: Using SCP (Direct Upload)**

From your local machine project directory:

```bash
scp -r . root@<your-server-ip>:/root/content-factory-web
```

## Step 4: Configure Environment Variables

Create a `.env` file on the server with your production environment variables.

```bash
cd content-factory-web
nano .env
```

Add your environment variables (copy from your local `.env`):

```env
DATABASE_URL="file:./dev.db"
NEXT_PUBLIC_SUPABASE_URL="your_supabase_url"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your_supabase_anon_key"
# Add other variables...
```

Save and exit (`Ctrl+X`, then `Y`, then `Enter`).

## Step 5: Start the Application

Build and start the container:

```bash
docker compose up -d --build
```

This command will:
1.  Build the Docker image.
2.  Start the container in detached mode (background).
3.  Expose the app on port 3000.

## Step 6: Verify Deployment

Check if the container is running:

```bash
docker compose ps
```

View logs if needed:

```bash
docker compose logs -f
```

## Step 7: Access Your App

Open your browser and visit:

```
http://<your-server-ip>:3000
```

**Note:** Ensure port 3000 is open in your Alibaba Cloud Security Group settings.

## Optional: Setup Nginx & HTTPS

For a production environment, it's recommended to use Nginx as a reverse proxy and setup SSL (HTTPS).

1.  Install Nginx on the server: `sudo apt install nginx`
2.  Configure Nginx to proxy requests to `localhost:3000`.
3.  Use Certbot to get a free SSL certificate.
