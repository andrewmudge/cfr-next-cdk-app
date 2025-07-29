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
- 📬 **Welcome Emails via SES** (Lambda)
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
| **SES**     | Sends welcome and notification emails |

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
MIT License © 2025 Andrew Mudge

