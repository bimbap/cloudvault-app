# CloudVault — Stateless Document Portal with AWS EC2 & S3

**LKS Cloud Computing · Level: Intermediate · Scenario: EC2, S3 & VPC Gateway Endpoint**

---

## 📋 Read This First

**CloudVault** is a lightweight, stateless document management and audit portal built with Node.js (Express) and AWS SDK v3. It is designed to run on an Amazon EC2 instance and interact with an Amazon S3 bucket directly through an **AWS VPC Gateway Endpoint**, eliminating the need for a local database or public internet access for storage operations.

All authentication to AWS services is handled transparently via an **IAM Instance Profile** attached to the EC2 instance, ensuring no AWS access keys or secrets are ever hardcoded or stored in the repository.

---

## 🏗️ Architecture

**CloudVault — EC2 to S3 Private Gateway Architecture**

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ AWS Cloud                                                                              │
│                                                                                        │
│  ╔══════════════════════════════════════════════════════════════════════════════════╗ │
│  ║ VPC: Application VPC (e.g., 10.0.0.0/16)                                         ║ │
│  ║                                                                                  ║ │
│  ║   Public / Application Subnet (e.g., 10.0.1.0/24)                                ║ │
│  ║   ┌───────────────────────────────────────────────────────────────────────────┐  ║ │
│  ║   │ EC2 Instance (Ubuntu 22.04 / 24.04 LTS)                                   │  ║ │
│  ║   │   Attached: IAM Role / Instance Profile (S3 Read/Write Permissions)       │  ║ │
│  ║   │                                                                           │  ║ │
│  ║   │   ┌───────────────────────────────────────────────────────────────────┐   │  ║ │
│  ║   │   │ Nginx Reverse Proxy (:80)                                         │   │  ║ │
│  ║   │   │   └─► Proxies inbound HTTP traffic to localhost:3000              │   │  ║ │
│  ║   │   └─────────────────────────────────┬─────────────────────────────────┘   │  ║ │
│  ║   │                                     │                                     │  ║ │
│  ║   │   ┌─────────────────────────────────▼─────────────────────────────────┐   │  ║ │
│  ║   │   │ CloudVault Server (Node.js 20 + Express + PM2 on :3000)           │   │  ║ │
│  ║   │   │   • Multer (RAM Buffer)  • AWS SDK v3  • Pre-signed URL           │   │  ║ │
│  ║   │   └─────────────────────────────────┬─────────────────────────────────┘   │  ║ │
│  ║   └─────────────────────────────────────┼─────────────────────────────────────┘  ║ │
│  ║                                         │ Internal Private Traffic               ║ │
│  ║                                         │ (Route Table: S3 Prefix List)          ║ │
│  ║                                         ▼                                        ║ │
│  ║   ┌───────────────────────────────────────────────────────────────────────────┐  ║ │
│  ║   │ VPC Gateway Endpoint: com.amazonaws.<region>.s3                            │  ║ │
│  ║   └─────────────────────────────────────┬─────────────────────────────────────┘  ║ │
│  ║                                         │ AWS Backbone Network                   ║ │
│  ╚═════════════════════════════════════════╪════════════════════════════════════════╝ │
│                                            │                                           │
│                                            ▼                                           │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐  │
│  │ Amazon S3 Bucket: <BUCKET_NAME>                                                  │  │
│  │   • Folders/Prefixes: akademik/, media/, arsip/, umum/                           │  │
│  │   • User-Defined S3 Metadata: uploader, description (Stateless Audit Log)        │  │
│  │   • Secure Client Downloads: Temporary Pre-Signed URLs (Configurable TTL)        │  │
│  └──────────────────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────────────────┘

Legend:  ──► HTTP Traffic    ──► AWS Private Network Traffic (VPC Endpoint)
```

---

## 📁 Project Structure

```
.
├── public/
│   ├── index.html            # Main dashboard: statistics, prefix breakdown & recent uploads
│   ├── files.html            # File explorer & temporary pre-signed URL generator
│   └── system.html           # System status, latency & S3 metadata stateless audit trail
├── userdata-proxy80.txt      # EC2 User Data: Node 20 LTS + PM2 + Nginx (Port 80 -> 3000)
├── userdata.txt              # Minimal EC2 User Data: Node 20 LTS + PM2
├── .env.example              # Environment variable template
├── .gitignore                # Git ignore configuration (.env, node_modules, package-lock.json)
├── package.json              # Project dependencies and startup script
├── server.js                 # Express server & AWS SDK v3 integration
└── README.md                 # Project documentation
```

---

## ⚙️ Configuration (`.env`)

Create a `.env` file in the root directory by copying `.env.example`:

```bash
cp .env.example .env
```

Set the following variables inside `.env`:

```env
PORT=3000
AWS_REGION=us-east-1
BUCKET_NAME=my-cloudvault-bucket-2026
```

### Environment Variables Detail

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | Optional | `3000` | Port where the Express application listens locally. |
| `AWS_REGION` | **Yes** | — | AWS Region where your S3 Bucket is located (e.g., `us-east-1`). |
| `BUCKET_NAME` | **Yes** | — | Target Amazon S3 bucket name created for this challenge. |

> [!IMPORTANT]
> The server has a fail-fast check: if `BUCKET_NAME` or `AWS_REGION` is missing, the application will exit immediately with an error log.

---

## ⚡ Quick Start & Deployment

### Method A: Provisioning via EC2 User Data (Recommended)

When launching the EC2 instance (Ubuntu 22.04 or 24.04 LTS), paste the content of [`userdata-proxy80.txt`](file:///m:/lks/task/tasks/ec2/pr-cloudvault-app/userdata-proxy80.txt) into the **Advanced details > User data** field. It automatically:
1. Installs Node.js 20 LTS, npm, and PM2.
2. Configures Nginx reverse proxy from Port `80` to Port `3000`.
3. Prepares `/home/ubuntu/cloudvault-app/` with proper ownership permissions.

After the instance is running:

```bash
# 1. SSH into the instance
ssh -i <your-key.pem> ubuntu@<EC2_PUBLIC_IP>

# 2. Clone or copy project files into the app directory
cd /home/ubuntu/cloudvault-app

# 3. Install dependencies
npm install

# 4. Create and configure .env
cp .env.example .env
nano .env

# 5. Start application with PM2 process manager
pm2 start server.js --name cloudvault
pm2 startup
pm2 save
```

### Method B: Manual / Local Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure .env
cp .env.example .env

# 3. Run application
npm start
```

Access the application in your browser at `http://<EC2_PUBLIC_IP>` (or `http://localhost:3000`).

---

## ⚠️ IMPORTANT NOTES

1. **No Credentials in Code or `.env`**: Never provide `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY`. The AWS SDK automatically retrieves IAM credentials from the EC2 Instance Profile metadata service (IMDSv2).
2. **IAM Instance Profile Required**: Attach an IAM Role to your EC2 instance with the following S3 permissions on `arn:aws:s3:::<BUCKET_NAME>` and `arn:aws:s3:::<BUCKET_NAME>/*`:
   - `s3:ListBucket`
   - `s3:GetBucketLocation`
   - `s3:GetObject`
   - `s3:PutObject`
   - `s3:DeleteObject`
3. **VPC Gateway Endpoint**: Ensure an **S3 Gateway Endpoint** (`com.amazonaws.<region>.s3`) is created in the VPC and associated with the subnet's Route Table for private, zero-NAT S3 communication.
4. **Stateless Processing**: Uploaded files are temporarily held in RAM (`Multer.memoryStorage()`) up to 20 MB and streamed directly to S3. No uploaded files are persisted on the EC2 local disk.

---

## 🔧 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Web dashboard (serves `public/index.html`) |
| `GET` | `/api/files` | Lists all S3 objects with user-defined metadata |
| `POST` | `/api/upload` | Uploads a file with folder prefix & metadata to S3 |
| `GET` | `/api/presign?key=<KEY>&expires=<SEC>` | Generates a temporary S3 pre-signed download URL |
| `DELETE` | `/api/files?key=<KEY>` | Deletes an object from the S3 bucket |
| `GET` | `/api/system` | Tests S3 latency & VPC Endpoint connectivity |

---

## 📎 References

- AWS SDK for JavaScript v3 S3 Client: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/
- AWS VPC Gateway Endpoints for Amazon S3: https://docs.aws.amazon.com/vpc/latest/privatelink/vpc-endpoints-s3.html
- EC2 Instance Profiles & IAM Roles: https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/iam-roles-for-amazon-ec2.html

---

*LKS Cloud Computing · Scenario Practice · CloudVault Application*
