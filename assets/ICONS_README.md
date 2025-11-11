# App Icons Required

To build the Windows installer, you need to create icon files in this folder.

## Required Files:

1. **icon.ico** - Windows icon (256x256px minimum)
2. **icon.icns** - macOS icon (512x512px source)
3. **icon.png** - Linux icon (512x512px)

## How to Create Icons:

### Option 1: Use an Existing PNG Image
1. Find or create a 512x512px PNG image for your app logo
2. Convert it to the required formats:
   - PNG to ICO: https://convertio.co/png-ico/
   - PNG to ICNS: https://cloudconvert.com/png-to-icns

### Option 2: Use Icon Generator Tools
- **Windows**: Use an online ICO converter
- **macOS**: Use `iconutil` command-line tool
- **Cross-platform**: Use electron-icon-maker package

```bash
# Install electron-icon-maker
npm install --save-dev electron-icon-maker

# Generate all icons from a single PNG
npx electron-icon-maker --input=source.png --output=assets/
```

## Temporary Workaround

If you don't have custom icons yet, you can:
1. Remove the icon references from `package.json` temporarily
2. The build will use default Electron icon
3. Add custom icons later and rebuild

## Icon Design Tips

- Use simple, recognizable design
- Avoid too much detail (icons are small)
- Use high contrast colors
- Test at different sizes
- Include transparent background
