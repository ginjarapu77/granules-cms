# Granules India CMS & Website — AWS Migration & Sync Guide

> **Notice for Engineers / Cursor AI Agent:**  
> This document is a complete, self-contained implementation manual for migrating the **Granules CMS** to AWS and connecting it seamlessly with the public **`granules-india-website`**. Follow each section step-by-step.

---

## 1. System Architecture Overview

The system consists of two connected codebases linked through **AWS S3** and **Amazon CloudFront**:

```
 ┌──────────────────────────────────────────────────────────────┐
 │                      AWS Infrastructure                      │
 │                                                              │
 │   ┌───────────────────────┐                                  │
 │   │ AWS App Runner / ECS  │                                  │
 │   │ (Granules CMS Server) │                                  │
 │   └──────────┬────────────┘                                  │
 │              │ Writes docs & publishes metadata              │
 │              ▼                                               │
 │   ┌──────────────────────────────────────────────────────┐   │
 │   │ S3 Bucket: granules-india-website-data (ap-south-1)  │   │
 │   │  ├─ investors/... (PDFs, PPTs)                       │   │
 │   │  ├─ media/... (press releases, images)               │   │
 │   │  ├─ sustainability/... (reports, policies)           │   │
 │   │  ├─ cms/index.json (master document registry)        │   │
 │   │  ├─ cms/navigation.json (category tree)             │   │
 │   │  └─ cms/pages.json (content pages like CSR)          │   │
 │   └──────────────────────────┬───────────────────────────┘   │
 │                              │                               │
 │                              ▼                               │
 │   ┌──────────────────────────────────────────────────────┐   │
 │   │ Amazon CloudFront (assets.granulesindia.com)         │   │
 │   └──────────────────────────┬───────────────────────────┘   │
 └──────────────────────────────┼───────────────────────────────┘
                                │ Fetches docs & metadata
                                ▼
         ┌──────────────────────────────────────────────┐
         │ granules-india-website (Public React/Vite)   │
         │ - Reads cms/index.json via CloudFront        │
         │ - Optional fallback to CMS /api/public/*     │
         └──────────────────────────────────────────────┘
```

### Key Repositories:
1. **CMS Repository (`granules-cms`)**:
   - `client/`: React 19 + Vite admin panel for uploading documents, categorizing, tagging by year/period, and managing content.
   - `server/`: Node.js / Express backend with `@aws-sdk/client-s3`. Manages files directly in S3 and publishes `cms/index.json`, `cms/navigation.json`, and `cms/pages.json`.
   - **Dual Serving**: In production, `server/src/index.js` automatically serves the compiled `client/dist` static assets and handles `/api/*` endpoints.

2. **Main Website Repository (`granules-india-website`)**:
   - React + Vite public site.
   - `src/lib/cmsClient.ts`: Client hook that fetches `cms/index.json` (or calls `/api/public/documents`) and automatically injects published documents into the Investor Relations portal (`InvestorOverviewPage.tsx`) and Homepage.

---

## 2. AWS Setup (Step-by-Step)

### Step 2.1: S3 Bucket Configuration
* **Bucket Name**: `granules-india-website-data`
* **Region**: `ap-south-1` (Asia Pacific - Mumbai)

#### Bucket CORS Policy
In the **AWS S3 Console** ➔ select bucket ➔ **Permissions** ➔ **Cross-origin resource sharing (CORS)**, save:
```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedOrigins": [
      "https://granulesindia.com",
      "https://cms.granulesindia.com",
      "http://localhost:5173",
      "http://localhost:4000"
    ],
    "ExposeHeaders": ["ETag"]
  }
]
```

---

### Step 2.2: IAM Policy & Role for the CMS Server
Create an IAM Policy named `GranulesCmsS3Policy`:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ListBucketAccess",
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket"
      ],
      "Resource": "arn:aws:s3:::granules-india-website-data"
    },
    {
      "Sid": "ObjectCrudAccess",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::granules-india-website-data/*"
    }
  ]
]
```

Attach this policy to the **IAM Role** assigned to your compute instance (App Runner Instance Role / ECS Task Role / EC2 Instance Profile).  
*When running inside AWS with this IAM role attached, the Node.js AWS SDK automatically retrieves temporary credentials. You do not need to hardcode `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY`.*

---

### Step 2.3: CloudFront Distribution
Configure or verify the CloudFront distribution pointing to `granules-india-website-data`:
- **Domain**: `assets.granulesindia.com` (or `cdn.granulesindia.com`)
- **Cache Behavior**:
  - `cms/*.json`: Cache TTL Minimum = `0`, Default = `60` seconds, Max = `300` seconds (to reflect new publications fast).
  - `*`: Cache TTL Minimum = `86400` seconds (1 day) for PDFs, images, etc.

---

## 3. Deploying the CMS (`granules-cms`) to AWS

### Option A: AWS App Runner (Recommended & Simplest)
AWS App Runner provides fully managed, scalable Node.js container hosting with automatic SSL and zero server maintenance.

1. **Build & Start Commands** (if deploying directly from GitHub):
   - **Runtime**: Node.js 20
   - **Build Command**:
     ```bash
     npm ci && npm run build -w client
     ```
   - **Start Command**:
     ```bash
     node server/src/index.js
     ```
   - **Port**: `4000`

2. **Environment Variables**:
   | Key | Example Value | Description |
   |---|---|---|
   | `PORT` | `4000` | Port Express runs on |
   | `S3_BUCKET` | `granules-india-website-data` | S3 bucket name |
   | `AWS_REGION` | `ap-south-1` | AWS region |
   | `ADMIN_EMAIL` | `admin@granulesindia.com` | Initial admin username |
   | `ADMIN_PASSWORD` | `<secure-cms-password>` | Initial admin password |
   | `JWT_SECRET` | `<64-char-random-string>` | Secret for authentication tokens |

3. **Instance Role**:
   - In App Runner **Security** settings, attach the IAM Role containing `GranulesCmsS3Policy`.

4. **Custom Domain**:
   - Add custom domain `cms.granulesindia.com` in App Runner and add the validation CNAME records to Route 53 or DNS provider.

---

### Option B: Docker Container Deployment (ECS / Fargate / DigitalOcean / EKS)
Use the included `Dockerfile` in the root of `granules-cms`:
```bash
docker build -t granules-cms:latest .
docker run -p 4000:4000 \
  -e PORT=4000 \
  -e S3_BUCKET=granules-india-website-data \
  -e AWS_REGION=ap-south-1 \
  -e ADMIN_EMAIL=admin@granulesindia.com \
  -e ADMIN_PASSWORD=change-me \
  -e JWT_SECRET=change-me-to-a-secure-secret \
  granules-cms:latest
```

---

## 4. How the Website Syncs with CMS Data

The synchronization is already engineered and works through two pathways:

### Pathway 1: Automatic CDN Sync (Ultra Fast & Resilient)
Every time an admin uploads, updates, or deletes a file in the CMS:
1. The CMS saves the file to its public path (e.g. `investors/financial-reports/annual-reports/2026/annual-report.pdf`).
2. The CMS rebuilds and uploads the catalog manifest to S3 at:
   `s3://granules-india-website-data/cms/index.json`
3. In `granules-india-website`, [`src/lib/cmsClient.ts`](file:///src/lib/cmsClient.ts) automatically fetches:
   ```typescript
   const CMS_CDN_INDEX = `${CLOUDFRONT_URL}/cms/index.json`;
   ```
4. The hook `useCmsInvestorSections()` in `InvestorOverviewPage.tsx` takes this data and immediately injects published items into the respective category tables (Annual Reports, Quarterly Results, Transcripts, Disclosures, etc.) without rebuilding the website!

### Pathway 2: Public CMS REST API (Dynamic Fallback)
The CMS exposes public endpoints that do not require authentication:
- `GET /api/public/documents` — Query documents by `prefix`, `year`, `type`, etc.
- `GET /api/public/index` — Full registry of published documents and category tree.
- `GET /api/public/navigation` — Category hierarchy.
- `GET /api/public/pages/:slug` — Content pages (e.g. `/api/public/pages/csr`).

In `granules-india-website/.env`:
```env
VITE_CMS_API_URL=https://cms.granulesindia.com/api
```

---

## 5. Engineer & Cursor Implementation Checklist

Use this checklist to run the migration:

- [ ] **1. Test CMS Build Locally**:
  ```bash
  cd granules-cms
  npm install
  npm run build -w client
  node server/src/index.js
  ```
  Open `http://localhost:4000` and verify the CMS admin login works.

- [ ] **2. Verify AWS Permissions**:
  Ensure local AWS profile or AWS instance IAM role has read/write permissions for `s3://granules-india-website-data`.

- [ ] **3. Push CMS to Production**:
  Deploy `granules-cms` to AWS App Runner / ECS with the environment variables listed in Section 3.

- [ ] **4. Configure Website Environment**:
  In `granules-india-website`:
  - Set `VITE_CMS_API_URL` to `https://cms.granulesindia.com/api` (or production endpoint).
  - Verify `CLOUDFRONT_URL` points to `https://assets.granulesindia.com` in `src/lib/pdf.ts`.

- [ ] **5. Test End-to-End Sync**:
  1. Log in to `https://cms.granulesindia.com`.
  2. Upload a test PDF under **Investors > Financial Reports > Annual Reports**, set year to `2026`, and set status to **Published**.
  3. Open `granulesindia.com/investors` (or local dev `npm run dev`).
  4. Verify that the new document shows up at the top of the Annual Reports table automatically.
