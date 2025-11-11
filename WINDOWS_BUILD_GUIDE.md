# Windows Build & Distribution Guide

## 📦 Building Proximity for Windows

This guide will help you package Proximity into an installer that Windows users can easily install and run.

## Prerequisites

Before building, ensure you have:
- ✅ Node.js installed (v18 or higher)
- ✅ All dependencies installed (`npm install`)
- ✅ App tested and working with `npm run dev`
- ✅ Icon files created (or we'll create placeholder ones)

## Step 1: Prepare for Production Build

### 1.1 Create App Icons

You need three icon formats for different platforms:
- `assets/icon.ico` - Windows icon (256x256 minimum)
- `assets/icon.icns` - macOS icon
- `assets/icon.png` - Linux icon (512x512)

**Quick way to create icons:**
1. Create or find a 512x512 PNG image for your app
2. Use online converters:
   - PNG to ICO: https://convertio.co/png-ico/
   - PNG to ICNS: https://cloudconvert.com/png-to-icns

**For now (placeholder):**
```bash
mkdir -p assets
# We'll create a basic icon or you can add your own later
```

### 1.2 Update package.json Metadata

Make sure these are set correctly in `package.json`:
```json
{
  "name": "proximity",
  "version": "1.0.0",
  "description": "Real-time voice communication with spatial audio",
  "author": "Bokuhoggie",
  "build": {
    "appId": "com.bokuhoggie.proximity",
    "productName": "Proximity"
  }
}
```

## Step 2: Build the Application

### 2.1 Build Production Webpack Bundle

```bash
npm run webpack:prod
```

This creates an optimized bundle in `src/renderer/dist/bundle.js` with:
- Minified code
- No source maps
- Production optimizations

### 2.2 Build Windows Installer

```bash
npm run build:win
```

This will:
1. Bundle all files using electron-builder
2. Create an NSIS installer (.exe)
3. Output to `dist/` folder

**Output files:**
- `dist/Proximity Setup 1.0.0.exe` - Windows installer
- `dist/win-unpacked/` - Unpacked app files (for testing)

## Step 3: Test the Build

### 3.1 Test Unpacked Version

```bash
# Navigate to unpacked folder
cd dist/win-unpacked

# Run the app
./Proximity.exe
```

### 3.2 Test the Installer

1. Double-click `Proximity Setup 1.0.0.exe`
2. Follow installation wizard
3. App installs to `C:\Program Files\Proximity` or custom location
4. Desktop shortcut created
5. Start menu entry added
6. Run the installed app and test all features

## Step 4: Distribution

### 4.1 What to Share

Share the installer file with your users:
- **File:** `dist/Proximity Setup 1.0.0.exe`
- **Size:** ~100-150 MB (includes Electron runtime)

### 4.2 Where to Host

**Option 1: GitHub Releases (Recommended)**
```bash
# Create a release on GitHub
# Upload the .exe file
# Users download from: https://github.com/Bokuhoggie/Proximity/releases
```

**Option 2: Google Drive / Dropbox**
- Upload the .exe file
- Share the link
- Users download and run

**Option 3: Self-Hosted**
- Host on your own website
- Provide download link

### 4.3 Create User Instructions

Create a simple README for end users (see below)

## Step 5: User Instructions Template

Save this as `DOWNLOAD_INSTRUCTIONS.md` to share with users:

```markdown
# How to Install Proximity

## Step 1: Download
Download `Proximity Setup 1.0.0.exe` from [insert download link]

## Step 2: Run Installer
1. Double-click the downloaded .exe file
2. Windows may show "Windows protected your PC" - click "More info" → "Run anyway"
3. Click "Next" and follow the installation wizard
4. Choose installation location (default is fine)
5. Click "Install"

## Step 3: Launch
- Find "Proximity" in your Start Menu
- Or double-click the desktop shortcut
- App will open and prompt for your username

## Step 4: First Time Setup
1. Enter your username
2. Click "Join Hub"
3. Go to Settings (⚙️ button) to:
   - Select your microphone
   - Select your speakers/headphones
   - Test your audio
   - Choose your user color

## Step 5: Join Voice Chat
1. Click the 🗺️ map button next to "Voice Chat"
2. Click "Voice Chat" to join
3. Drag your user around the map to hear spatial audio!

## Troubleshooting

### "Windows protected your PC" message
This is normal for unsigned applications. Click "More info" → "Run anyway"

### No audio
1. Go to Settings
2. Select your correct microphone and output device
3. Click "Test Microphone" to verify

### Can't connect
Make sure you have an internet connection. The app connects to our server at Railway.

### Need help?
Contact [your contact info] or report issues on GitHub
```

## Step 6: Code Signing (Optional, for Production)

To remove the "Windows protected your PC" warning, you need to sign your app with a certificate:

**Requirements:**
- Code signing certificate ($50-200/year)
  - Providers: DigiCert, Sectigo, SSL.com
- Update package.json with certificate info

**Without code signing:**
- Users see "Unknown publisher" warning
- They must click "More info" → "Run anyway"
- Still safe, just requires one extra click

## Common Build Issues

### Issue: "Cannot find module 'electron-builder'"
**Fix:** `npm install electron-builder --save-dev`

### Issue: Build fails on missing icons
**Fix:** Create placeholder icons or remove icon references from package.json temporarily

### Issue: "ENOENT: no such file or directory"
**Fix:** Make sure webpack bundle is built first: `npm run webpack:prod`

### Issue: Large installer size (200MB+)
**This is normal!** Electron includes a full Chromium browser and Node.js runtime.

## Auto-Updates (Future Enhancement)

To add automatic updates:
1. Set up electron-updater
2. Host updates on GitHub Releases
3. App checks for updates on startup
4. Users get notified and can update in-app

## Build Checklist

Before distributing to users:

- [ ] Test app in dev mode thoroughly
- [ ] Create app icons (or use placeholders)
- [ ] Update version number in package.json
- [ ] Build production webpack: `npm run webpack:prod`
- [ ] Build Windows installer: `npm run build:win`
- [ ] Test unpacked app in `dist/win-unpacked/`
- [ ] Test full installer on clean Windows PC
- [ ] Verify all features work (voice, chat, map)
- [ ] Create download instructions for users
- [ ] Upload to distribution platform
- [ ] Share download link!

## Notes

- First build takes 5-10 minutes (downloads Electron runtime)
- Subsequent builds are faster (2-3 minutes)
- Always test on a clean Windows install if possible
- Users need ~200MB free disk space
- App requires internet connection (connects to Railway server)
