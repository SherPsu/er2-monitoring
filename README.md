# PhilHealth ER2 MEMSEC Monitoring System

A web-based monitoring system for PhilHealth MEMSEC (Membership Section) to track ER2 (Employer Registration) forms. Now with Firebase cloud database for real-time sync and multi-device access.

## Features

- **Add ER2 Records**: Input employer details including:
  - Employer's Name
  - PEN (PhilHealth Employer Number)
  - Number of Employees
  - Date Received
  - Date Process
  - Processed By
  - Date Released
  - Received By

- **Track Status**: Automatic status tracking (Pending, Processed, Released)
- **Search Records**: Search by Employer Name or PEN
- **Edit/Delete Records**: Modify or remove existing records
- **Statistics Dashboard**: View counts of total, pending, processed, and released records
- **Export to Excel**: Export all records to Excel (.xlsx) format
- **Data Backup/Restore**: Import/Export JSON backup files
- **Cloud Sync**: Real-time synchronization via Firebase Firestore
- **Offline Support**: Works offline with automatic sync when online
- **Multi-device Access**: Access data from any device with internet

## Firebase Setup Required

Before using the system, you must configure Firebase:

### Step 1: Create Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Create a project" or select existing
3. Follow the setup wizard

### Step 2: Add Web App
1. In Project Overview, click the web icon `</>`
2. Register app with a nickname (e.g., "ER2-Monitoring")
3. Copy the `firebaseConfig` object

### Step 3: Configure Environment Variables

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Open `.env` and replace all placeholder values with your Firebase config credentials from Step 2:
   ```
   VITE_FIREBASE_API_KEY=your_actual_api_key
   VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   ```

**Important**: Never commit `.env` to version control. It's already in `.gitignore` to protect your secrets.

### Step 4: Configure Firestore
1. Go to "Firestore Database" from left menu
2. Click "Create database"
3. Start in **test mode** (allow read/write for development)
4. Select a location close to you (e.g., `asia-southeast1` for Philippines)

### Step 5: Update Configuration
Open `app.js` and replace the `firebaseConfig` object (lines 9-17) with your config:

```javascript
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "your-project.firebaseapp.com",
    projectId: "your-project-id",
    storageBucket: "your-project.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abcdef123456"
};
```

### Step 5: Security Rules (Production)
After testing, update Firestore security rules:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /er2_records/{document} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## How to Use

1. Open `index.html` in any modern web browser
2. Configure Firebase (see above)
3. Fill in the form with ER2 information
4. Click "Save Record" to add to the database
5. Use the search box to find specific records
6. Click "Edit" or "Delete" buttons to modify records
7. Export data to Excel for reporting

## Technical Details

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Database**: Firebase Firestore (cloud NoSQL database)
- **Authentication**: Anonymous auth for simple access
- **Storage**: Cloud sync with offline persistence
- **Styling**: Professional government green theme
- **Real-time**: Automatic sync across all connected devices

## Browser Compatibility

- Chrome 90+
- Firefox 90+
- Edge 90+
- Safari 14+

## Files

- `index.html` - Main application structure
- `styles.css` - Styling and responsive design
- `app.js` - Application logic and Firebase operations
- `firebase-config.js` - Configuration helper template
- `README.md` - This file

## Created for

PhilHealth MEMSEC (Membership Section) - ER2 Form Monitoring
