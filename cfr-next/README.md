# CFR Next

A secure, full-stack web platform for the Churchwell Family Reunion, built with [Next.js](https://nextjs.org/) and AWS CDK. This app leverages modern cloud-native architecture to manage user authentication, content access, media storage, and operational automation.

---

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [AWS Services Used](#aws-services-used)
- [Installation](#installation)
- [Environment Configuration](#environment-configuration)
- [Usage](#usage)
- [API Routes](#api-routes)
- [Infrastructure-as-Code (CDK)](#infrastructure-as-code-cdk)
- [AWS Well-Architected Compliance](#aws-well-architected-compliance)
- [Security](#security)
- [Contributing](#contributing)
- [License](#license)

---

## 📖 Overview

CFR Next is a cloud-native application that powers private family content access, event announcements, and photo sharing. The stack is composed of:

- **Frontend:** Built with Next.js (React + API routes).
- **Backend:** AWS services via CDK: Lambda, Cognito, DynamoDB, S3.
- **Infrastructure:** Defined as code using AWS CDK for repeatable, secure deployments.

---

## ✨ Features

- 🔐 **Secure User Authentication** (via Amazon Cognito)
- 🛂 **Email-based Access Control** (via DynamoDB whitelist)
- 📸 **Photo Upload and Browsing** (S3 + Lambda)
- 📤 **Admin Tools for User Management** (Lambda)
- 📬 **Family email via SES**: master mailing list, admin compose with attachments, sign-up confirmations and announcements (Lambda)
- 🏗️ **Infrastructure as Code (CDK)**

---

## 🏛️ Architecture

Next.js (SSR / API Routes)
|
|--- /api/ calls →
- AWS Lambda (Business Logic)
- Amazon Cognito (Auth)
- DynamoDB (Access Control)
- S3 (Media Storage)
- SES (Emails)


Directory Structure:

.
├── cfr-next # Next.js app with frontend, API routes, lib/
└── cdk # AWS CDK stacks and constructs


## ☁️ AWS Services Used

| Service     | Purpose |
|------------|---------|
| **Cognito** | User sign-up/sign-in, JWT token management |
| **Lambda**  | Business logic: upload photos, delete photos, tigger ses, list users, etc. |
| **DynamoDB**| Stores list of approved user emails |
| **S3**      | Stores user-uploaded images |
| **SES**     | Family-wide emails, sign-up confirmations and announcements (see [Email](#-email-ses)) |

---

## 🚀 Installation

```bash
git clone https://github.com/andrewmudge/cfr-next-cdk-app.git
cd cfr-next
npm install

To deploy infrastructure:
cd cdk
npm install
npx cdk deploy
⚙️ Environment Configuration
Create a .env.local file in cfr-next/ with the following:

env
NEXT_PUBLIC_COGNITO_USER_POOL_ID=...
NEXT_PUBLIC_COGNITO_CLIENT_ID=...
COGNITO_ADMIN_URL=https://your-lambda-url.amazonaws.com/dev/auth
S3_PHOTO_BUCKET=your-photo-bucket-name
Secrets like AWS credentials should be handled via environment variables or secret managers in production.

## 📬 Email (SES)

**How it works**
- `MailingList` (DynamoDB) is the master email list and the source of truth. Manage it in the admin console under **Family Email → Mailing list**. *Sync from site data* pulls in family-tree, sign-up and account emails. *Import Google Group CSV* reads a Google Groups member export. Neither one re-subscribes anyone who unsubscribed, bounced or complained.
- **Family Email → Compose** queues a job on the `Broadcasts` table, and the app invokes the `SendBroadcastFn` Lambda (`lambda-functions/send-broadcast.js`) asynchronously. The Lambda sends each recipient their own copy with an unsubscribe link, then writes progress back to the row, which the **Sent** tab shows. Attachments go from the browser straight to S3 (`email-attachments/`, deleted after 30 days) through presigned URLs.
- Each successful sign-up (`POST /api/registrations`) queues a `signup` job. The new family gets a confirmation, and every other family registered that year gets an announcement, which you can switch off under **Settings**.
- SES bounce and complaint events go through EventBridge to `EmailEventsFn` (`lambda-functions/email-events.js`), which marks the address on the list. Unsubscribe links go to `/api/unsubscribe`, which also supports Gmail/Yahoo one-click.
- Mail is sent From `reunion@churchwellreunion.com` with Reply-To set to the admin Gmail. The domain has no mailbox.

**Env vars (Vercel + `.env.local`)**
```
BROADCAST_FUNCTION_NAME=<SendBroadcastFunctionName stack output>
ATTACHMENTS_BUCKET=<AttachmentsBucketName stack output>
MAILING_LIST_TABLE=MailingList        # optional, this is the default
BROADCASTS_TABLE=Broadcasts           # optional, this is the default
```
Sender name, address and Reply-To are set on the Lambda in `cdk/lib/cdk-stack.ts`.

**One-time setup**
1. `npx cdk deploy`. This creates the SES domain identity, config set, tables and Lambdas.
2. DNS for churchwellreunion.com is hosted at **Vercel** (nameservers `ns1/ns2.vercel-dns.com`), not GoDaddy. In Vercel → Domains → churchwellreunion.com → DNS Records, add the records SES lists for the identity. Enter names without the `.churchwellreunion.com` suffix.
   | Type | Name | Value |
   |---|---|---|
   | CNAME ×3 | `<token>._domainkey` | `<token>.dkim.amazonses.com` |
   | MX (priority 10) | `mail` | `feedback-smtp.us-east-1.amazonses.com` |
   | TXT | `mail` | `v=spf1 include:amazonses.com ~all` |
   | TXT | `@` | `v=spf1 include:amazonses.com ~all` |
   | TXT | `_dmarc` | `v=DMARC1; p=none; adkim=r; aspf=r` |
   After 2–4 weeks of clean sending, tighten DMARC to `p=quarantine`.
3. Wait for SES → Identities to show the domain as *Verified*, then request **production access** (SES → Account dashboard). Until it's approved, SES only delivers to verified addresses.
4. Set the env vars above in Vercel and redeploy.
5. Check: send a test from the admin console, then in Gmail open ⋮ → *Show original*. SPF, DKIM and DMARC should all show PASS.

🧪 Usage
Run locally:
npm run dev
Visit: http://localhost:3000


📡 API Routes
All API logic lives in `cfr-next/pages/api` and follows RESTful conventions.

Examples:

- `POST /pages/api/auth/signin` → Cognito admin auth flow
- `POST /pages/api/photos/upload` → Secure photo upload via Lambda + S3
- `DELETE /pages/api/auth/cognito-users/delete` → Admin-only user removal

Routes call helper functions in `/lib` to separate logic from routing and to interact with AWS services (Cognito, DynamoDB, S3, Lambda).


🛠️ Infrastructure-as-Code (CDK)
CDK Stacks (located in the `cdk/` directory):

- `lib/cdk-stack.ts`: Provisions Cognito user pool, Lambda triggers, DynamoDB table, S3 photo bucket, and related resources.
- `bin/cfr-cdk-docker.ts`: Entry point for CDK app deployment.

Resources provisioned include:
- Cognito user pool (with triggers for post-confirmation and migration)
- DynamoDB ApprovedEmails table
- S3 photo bucket (with CORS and lifecycle rules)
- Lambda functions for business logic (photo upload, list, delete, user management, post-confirmation email)

To deploy all infrastructure:

cd cdk
npm install
npx cdk deploy
```
🧱 AWS Well-Architected Compliance
Pillar	Implementation
Operational Excellence	CloudWatch logs, CDK IaC, potential CI/CD
Security	MFA, HttpOnly JWTs, least privilege IAM
Reliability	Redundant managed services (S3, Cognito)
Performance Efficiency	Lambda, DynamoDB, static Next.js pages
Cost Optimization	Serverless, S3 lifecycle rules, on-demand DB
Sustainability	Auto-scaling, energy-efficient architecture

🔐 Security
JWT tokens stored in HttpOnly cookies
DynamoDB checks for authorized users
IAM policies follow least-privilege principle
Cognito uses email verification, password policies

📄 License
MIT License © 2025 Andrew Mudge.

