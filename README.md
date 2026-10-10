# MahalMate — Marriage & Function Hall Booking

MahalMate is a React/Vite frontend and Express/MySQL booking-request application. It uses the MySQL credentials already in `server/.env` but creates and uses a separate `mahalmate` database by default; it does not change the older `eventfest` schema or its data. The included venues and service prices are explicitly labeled sample data and are not real business offers.

## Start the app

Start MySQL Server first, then use two VS Code terminals in the project folder.

**Terminal 1 — backend API**

```powershell
cd server
npm install
npm start
```

**Terminal 2 — frontend**

```powershell
cd client
npm install
npm run dev
```

Open the Vite URL shown in Terminal 2 (usually <http://localhost:5173>). Port 5000 is currently occupied by the previous EventFest server, so MahalMate is configured for <http://localhost:5001>; Vite forwards `/api` requests to that port. If port 5001 is also occupied, change `PORT` in `server/.env` and the proxy target in `client/vite.config.js` to the same available port.

The API creates the `mahalmate` database and its tables on startup. The configured MySQL account must be allowed to create a database and tables. If it cannot create databases, create a database named `mahalmate` in MySQL Workbench and grant that account the required database permissions; no existing database should be dropped or renamed.

## Create an administrator

Register a normal customer account in the website first if you need a customer test account. To create an administrator, start the API once so it creates the schema, then open another PowerShell terminal in `server` and set private environment variables only in that terminal:

```powershell
$env:ADMIN_NAME = "Your Admin Name"
$env:ADMIN_EMAIL = "admin@example.com"
$env:ADMIN_PHONE = "+91 98765 43210"
$securePassword = Read-Host "Choose a private password" -AsSecureString
$env:ADMIN_PASSWORD = [System.Net.NetworkCredential]::new("", $securePassword).Password
npm run create-admin
Remove-Item Env:ADMIN_PASSWORD
Remove-Variable securePassword
```

Use a password with at least 12 characters. The setup script creates a new admin only; it refuses to overwrite an account. Sign in using those credentials. Administrators can approve or reject requests, manage sample venue listings, and manage optional services.

## Booking behavior

Customers submit booking requests; new requests have **Pending** status and block overlapping time slots. Admin approval changes a request to **Confirmed**. Rejected and cancelled requests do not block dates. A customer can cancel pending requests at any time and confirmed bookings at least seven days before the event. The system does not integrate a payment gateway, charge customers, or claim that payment has been received. No tax is applied because tax rules are not configured.

Availability is checked against existing pending and confirmed bookings before listing a requested date and again inside a MySQL transaction immediately before creating the request. The API calculates prices from database venue/service prices; browser-submitted totals are ignored.

## XML export

Signed-in customers can download their own booking XML from the confirmation page. Admins can access booking XML for any booking. XML is built by `fast-xml-parser`; it contains booking/contact and price details only after the API authorization check.

## Checks

```powershell
cd server
npm run check
cd ..\client
npm run lint
npm run build
```

Copy `server/.env.example` to `server/.env` only for a fresh setup. Preserve existing local credentials; never copy database passwords into frontend environment variables or commit `.env` files.
