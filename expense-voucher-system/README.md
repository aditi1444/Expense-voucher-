# Expense Voucher Management System

An internal expense voucher and approval application for Prachay Securities Private Limited (PSPL). Employees prepare and submit vouchers, Directors approve or reject them, and Accounts users can review the resulting records.

## Features

- JWT-based login with three server-enforced roles: Employee, Director, and Accounts.
- Employee-owned draft creation, editing, deletion, signature capture, and submission.
- Director review with mandatory signature for approval and a reason for rejection.
- Read-only Accounts dashboard with approval and rejection information.
- Role-scoped dashboard statistics and searchable, filterable voucher lists.
- Employee dashboard with personal workflow statistics, recent vouchers, and a six-month expense-date chart.
- Drawing-pad or image-upload signatures. Signature images are validated and stored on the voucher document.
- Responsive dashboard, voucher details, confirmation prompts, and printable voucher details.

## Technology

- Frontend: React, Vite, JavaScript
- Backend: Node.js, Express, Mongoose
- Database: MongoDB / MongoDB Atlas
- Authentication: JWT and bcryptjs

## Project structure

```text
backend/
  config/
  controllers/
  middleware/
  models/
  routes/
  createStaffUser.js
  server.js
frontend/
  src/
    App.jsx
    App.css
    index.css
README.md
```

## Roles and workflow

The workflow is `Draft → Submitted → Approved` or `Draft → Submitted → Rejected`. Submission records `submittedAt` separately from the document's general `updatedAt` timestamp so later approval or rejection does not replace the submission date.

- **Employee:** can access only their own vouchers. They can edit or delete Draft vouchers, provide a signature, and submit. Submitted or processed vouchers are read-only to the employee.
- **Director:** can view and filter all vouchers. Only Submitted vouchers can be approved or rejected. Approval requires a Director signature; rejection requires a reason.
- **Accounts:** can view and filter all vouchers and inspect signatures, approval dates, and rejection reasons. Accounts has no write or workflow permissions.

Role checks, voucher ownership, and allowed status transitions are enforced by the backend; the frontend role-specific controls are not the security boundary.

## Requirements

- Node.js 20.19+ or 22.12+ (Vite 8 requirement)
- npm
- A MongoDB database (MongoDB Atlas or local MongoDB)

## Setup

### 1. Configure the backend

In a terminal:

```powershell
cd "C:\Users\Asus\new projectt\expense-voucher-system\backend"
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm install
```

Edit `backend/.env` and set:

```dotenv
PORT=5000
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster-host>/expense_voucher_db?retryWrites=true&w=majority
JWT_SECRET=<a-long-random-secret>
CLIENT_URL=http://localhost:5173
```

For `JWT_SECRET`, generate a random value locally, for example:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

In MongoDB Atlas, create a database user, allow the development machine's IP in Network Access, and replace the URI placeholders. Never commit `.env` or share the connection string.

Start the backend in its own terminal:

```powershell
npm run dev
```

The API listens on `http://localhost:5000`. Check `http://localhost:5000/api/health`.

### 2. Provision the initial staff accounts

Use an isolated non-production database for test accounts. Before provisioning, confirm `backend/.env` points to that database. Public registration creates Employee accounts only.

In an interactive backend terminal, run the command for each privileged account, replacing the example name and email. The script prompts for the password without echoing it or putting it in command history:

```powershell
cd "C:\Users\Asus\new projectt\expense-voucher-system\backend"
node .\createStaffUser.js director "Director Name" director@company.example
```

```powershell
cd "C:\Users\Asus\new projectt\expense-voucher-system\backend"
node .\createStaffUser.js accounts "Accounts Name" accounts@company.example
```

Choose a unique password of at least 12 characters and communicate it through the organization's secure credential-delivery process. The script refuses to overwrite an existing email. It does not grant privileged roles through public registration.

Employee accounts can be registered through `POST /api/auth/register`; the frontend login page is intended for provisioned accounts and does not expose registration. To create a second local test Employee without putting the password in command history, run this from PowerShell while the non-production backend is running, and replace the example identity values:

```powershell
$employeePasswordSecure = Read-Host "Employee B password" -AsSecureString
$employeePassword = [System.Net.NetworkCredential]::new("", $employeePasswordSecure).Password
$employeeBody = @{
  name = "Employee B Test"
  email = "employee-b.test@company.example"
  password = $employeePassword
  employeeId = "EMP-TEST-002"
  department = "QA"
} | ConvertTo-Json
try {
  Invoke-RestMethod -Uri "http://localhost:5000/api/auth/register" -Method Post -ContentType "application/json" -Body $employeeBody | Out-Null
  Write-Output "Employee registration succeeded."
} finally {
  Remove-Variable employeePasswordSecure, employeePassword, employeeBody
}
```

This invokes the existing public registration endpoint, which assigns the Employee role regardless of additional role fields. Use this local HTTP example only with a non-production backend on the same machine.

For an authorized local password reset, run `node .\resetPassword.js <account-email>` from `backend`; the new password is prompted without echo. Protect access to this utility and do not run it against an unintended database.

### 3. Configure and start the frontend

In a second terminal:

```powershell
cd "C:\Users\Asus\new projectt\expense-voucher-system\frontend"
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm install
npm run dev
```

Open the Vite URL printed in the terminal, normally `http://localhost:5173`. `VITE_API_URL` defaults to `http://localhost:5000/api`. Set `CLIENT_URL` in the backend environment to the frontend origin if it differs from the default. Multiple allowed origins can be comma-separated.

## API overview

All authenticated requests must include the JWT in the Authorization header using the Bearer scheme. JSON endpoints return a `success` property and a useful `message` on errors.

### Authentication

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | Public; Employee only | Register an employee account |
| POST | `/api/auth/login` | Public | Login; returns token and safe user details |
| GET | `/api/auth/me` | Any authenticated role | Retrieve the current account |

### Vouchers

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| POST | `/api/vouchers` | Employee | Create a Draft voucher |
| GET | `/api/vouchers/my-vouchers` | Employee | List only the current employee's vouchers |
| GET | `/api/vouchers/my-vouchers/:id` | Owning Employee | Read an employee voucher |
| PATCH | `/api/vouchers/:id` | Owning Employee | Update a Draft and/or its signature |
| DELETE | `/api/vouchers/:id` | Owning Employee | Delete a Draft |
| PATCH | `/api/vouchers/:id/submit` | Owning Employee | Submit a signed Draft |
| GET | `/api/vouchers` | Director, Accounts | List all vouchers |
| GET | `/api/vouchers/pending` | Director | List submitted vouchers |
| GET | `/api/vouchers/:id` | Director, Accounts | Read voucher details |
| PATCH | `/api/vouchers/:id/approve` | Director | Approve a Submitted voucher with a signature |
| PATCH | `/api/vouchers/:id/reject` | Director | Reject a Submitted voucher with a reason |
| GET | `/api/vouchers/dashboard/stats` | Any authenticated role | Return role-scoped summary counts, approved expenditure, and monthly voucher totals for the last six calendar months |

List endpoints accept `search`, `status`, `employee`, `department`, `category`, `from`, `to`, `minAmount`, `maxAmount`, `sort`, `order`, `page`, and `limit` query parameters. Sorting is limited to supported voucher fields; page size is capped at 100. Date filters apply to the expense date. Search values are treated as literal text, not MongoDB query expressions.

For Employee requests, summary statistics and monthly voucher totals are scoped to the authenticated employee. Monthly totals group all voucher statuses by `expenseDate`; the approved expenditure total includes only Approved vouchers.

## Validation and security

- The authenticated account supplies employee identity; clients cannot set the employee, voucher number, Director, approval date, or status.
- Employees can access only their own vouchers and edit/delete only Draft vouchers.
- Only Directors can process Submitted vouchers; updates use conditional status transitions to prevent repeat processing.
- Amount must be positive; department, title, category, and expense date are required.
- Employee and Director signatures must be PNG, JPEG, or WebP images no larger than 400 KB. SVG and arbitrary URLs are not accepted.
- Rejection reasons must contain at least five characters.
- Password hashes are excluded from ordinary user queries and responses. Public registration forces the Employee role.
- Helmet, CORS allowlisting, environment-based secrets, JSON body limits, and `.gitignore` protection are configured.

## Checks

Run these checks from the relevant directories:

```powershell
# Frontend lint and production build
cd "C:\Users\Asus\new projectt\expense-voucher-system\frontend"
npm run lint
npm run build

# Backend JavaScript syntax checks
cd "C:\Users\Asus\new projectt\expense-voucher-system\backend"
npm test
node --check .\server.js
node --check .\controllers\authController.js
node --check .\controllers\voucherController.js
node --check .\routes\authRoutes.js
node --check .\routes\voucherRoutes.js
node --check .\middleware\authMiddleware.js
```

`npm test` runs backend controller and authorization unit tests without connecting to MongoDB or changing database records. A separate automated browser/database integration suite is not configured; complete the following end-to-end checks against a non-production database and test accounts.

## Manual workflow verification

1. Start MongoDB and both applications; confirm `/api/health` reports `"database":"connected"`.
2. Provision one Director and one Accounts account and register or provision an Employee.
3. Log in as Employee, save a Draft, edit it, and verify it remains Draft until Submit is explicitly selected.
4. Submit without a signature (must fail), then add a drawn/uploaded signature and submit.
5. Verify the submitted record is visible to Director, but not editable by Employee.
6. As Director, approve one submitted test voucher with a signature; reject another with a reason. Attempts without required inputs or on processed vouchers must fail.
7. Confirm Employee can see their own resulting statuses and rejection reason.
8. Confirm Accounts can view voucher details and signatures, but cannot change voucher data or status.
9. Try accessing another Employee's voucher ID while logged in as Employee; it must return not found.

## Troubleshooting

- **MongoDB connection fails:** check `MONGODB_URI`, Atlas IP allowlisting, and database-user permissions. Do not paste credentials into issue reports.
- **Browser reports a network/CORS error:** ensure the backend is running and `CLIENT_URL` exactly matches the frontend origin.
- **Login returns 401:** verify the account email/password and confirm the account is active.
- **Token was rejected:** sign in again; JWT sessions expire after one day.
- **Staff creation reports an existing email:** the script intentionally leaves existing accounts unchanged; use your approved account-management process.
- **Signature rejected:** use a genuine PNG, JPEG, or WebP file no larger than 400 KB, or draw directly on the pad.

## Limitations

- Voucher lists are paginated at 25 records per dashboard page; the API allows page sizes up to 100.
- Signature images are stored as base64 data in MongoDB voucher documents. For high-volume production use, consider a private object-storage service with access-controlled delivery and retention policies.
- Browser/database integration checks must be run against a non-production database.
