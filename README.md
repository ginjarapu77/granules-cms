# Granules CMS

Internal Content Management System for Granules India documents, disclosures, financial reports, policies, and website pages.

## Quick Start (Local Development)

```bash
# 1. Install dependencies
npm install

# 2. Configure server environment
cp server/.env.example server/.env
# Edit server/.env with your AWS bucket and credentials

# 3. Start development server (runs client on :5173 and server on :4000)
npm run dev
```

## Production & AWS Deployment

For full AWS deployment steps (App Runner / ECS, S3, IAM, CloudFront) and website synchronization instructions, refer to:

👉 **[AWS Deployment & Website Sync Guide](AWS_DEPLOYMENT_AND_WEBSITE_SYNC_GUIDE.md)**
