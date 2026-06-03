# Vercel Deployment Setup Guide

This guide will help you set up the ER2 Monitoring System on Vercel with proper Firebase configuration.

## Step 1: Deploy to Vercel

1. **Connect your Git repository to Vercel**
   - Go to [vercel.com](https://vercel.com)
   - Click "New Project"
   - Select your GitHub repository
   - Click "Import"

2. **Configure Build Settings**
   - Framework Preset: **Vite**
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Click "Deploy"

## Step 2: Add Firebase Environment Variables

**Important**: After deployment, you need to add your Firebase credentials to Vercel's environment variables.

### Option A: Via Vercel Dashboard (Recommended)

1. Go to your project in [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project
3. Click on **Settings** tab
4. Click on **Environment Variables** (left sidebar)
5. Add each of these variables with your Firebase credentials:

```
VITE_FIREBASE_API_KEY = your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN = your_firebase_auth_domain
VITE_FIREBASE_PROJECT_ID = your_firebase_project_id
VITE_FIREBASE_STORAGE_BUCKET = your_firebase_storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID = your_firebase_messaging_sender_id
VITE_FIREBASE_APP_ID = your_firebase_app_id
```

**Make sure to select the appropriate environments:**
- ✓ Production
- ✓ Preview
- ✓ Development

6. Click "Save"
7. Redeploy your application (click "Redeploy" button or push a new commit)

### Option B: Via Vercel CLI

```bash
# Install Vercel CLI
npm install -g vercel

# Link your project
vercel link

# Add environment variables
vercel env add VITE_FIREBASE_API_KEY
vercel env add VITE_FIREBASE_AUTH_DOMAIN
vercel env add VITE_FIREBASE_PROJECT_ID
vercel env add VITE_FIREBASE_STORAGE_BUCKET
vercel env add VITE_FIREBASE_MESSAGING_SENDER_ID
vercel env add VITE_FIREBASE_APP_ID

# Redeploy
vercel --prod
```

## Step 3: Get Your Firebase Credentials

If you don't have your Firebase credentials:

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project
3. Click ⚙️ **Project Settings** (gear icon)
4. Go to **Service Accounts** tab
5. Click **Generate New Private Key**
6. Copy the JSON file and find these values:
   - `api_key` → VITE_FIREBASE_API_KEY
   - `auth_domain` → VITE_FIREBASE_AUTH_DOMAIN
   - `project_id` → VITE_FIREBASE_PROJECT_ID
   - `storage_bucket` → VITE_FIREBASE_STORAGE_BUCKET
   - `messaging_sender_id` → VITE_FIREBASE_MESSAGING_SENDER_ID
   - `app_id` → VITE_FIREBASE_APP_ID

**Alternative**: Go to Project Settings → General tab and copy from the `firebaseConfig` object.

## Step 4: Configure Firestore Security Rules

1. In Firebase Console, go to **Firestore Database**
2. Click **Rules** tab
3. Replace with:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /er2_records/{document=**} {
      allow read, write: if request.auth != null;
    }
    match /users/{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

4. Click **Publish**

## Step 5: Test Your Deployment

1. Visit your Vercel deployment URL
2. You should see the access modal ("Which service would you like to access?")
3. Click "ER2 Monitoring" to access the application
4. If Firebase is properly configured, you should not see console errors

## Troubleshooting

### Issue: "Uncaught TypeError: Cannot read properties of undefined"
**Problem**: Firebase configuration not loading  
**Solution**:
1. Check that all 6 environment variables are added in Vercel
2. Make sure you selected all 3 environments (Production, Preview, Development)
3. Redeploy the application (any deployment after adding env vars)
4. Hard refresh your browser (Ctrl+Shift+R or Cmd+Shift+R)

### Issue: "Firestore permission denied"
**Problem**: Security rules blocking access  
**Solution**:
1. Check Firestore Rules in Firebase Console
2. Make sure rules allow authenticated users
3. Create a user and log in with Firebase Authentication

### Issue: "Failed to load resource: 404"
**Problem**: Minor issue with favicon  
**Solution**: This is not critical. The app will still work. Optionally add a `favicon.ico` to the project root.

## Environment Variables Checklist

After deployment, verify these steps:

- [ ] All 6 environment variables added in Vercel Settings
- [ ] All 3 environments selected (Production, Preview, Development)
- [ ] Deployment redeployed after adding variables
- [ ] Browser cache cleared
- [ ] Firebase Firestore database created
- [ ] Firestore Security Rules updated
- [ ] Collections created: `er2_records`, `users`

## Next Steps

1. Create an admin user through Firebase Authentication
2. Add your PhilHealth staff to the system
3. Start adding ER2 records
4. Set up regular backups

## Support

- [Vercel Documentation](https://vercel.com/docs)
- [Vite Documentation](https://vitejs.dev)
- [Firebase Documentation](https://firebase.google.com/docs)

---

**Last Updated**: June 2026  
**For Questions**: Contact your system administrator
