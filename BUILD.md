# Build Instructions — Prismi Dashboard v1.4.0

## System Requirements

- **OS:** Windows, macOS, or Linux
- **Node.js:** 20.x or later
- **npm:** 10.x or later (ships with Node.js)

## Step-by-Step Build

```bash
# 1. Install Node.js 20+ from https://nodejs.org

# 2. Extract the source package and open the directory
cd prismi-dashboard

# 3. Install dependencies
npm install

# 4. Run the build
npm run build
```

## Build Output

After `npm run build`, the extension is in `dist/`:

```
dist/
├── manifest.json
├── newtab.html
├── popup.html
├── icons/
├── assets/
│   ├── newtab-<hash>.js
│   ├── newtab-<hash>.css
│   ├── popup-<hash>.js
│   ├── popup-<hash>.css
│   └── ...
└── _locales/
    ├── en/messages.json
    └── pt_BR/messages.json
```

The `dist/` folder is the exact package to submit to the Firefox Add-ons store.

## Build Scripts (package.json)

| Script | Description |
|---|---|
| `npm run build` | Full build: generates icons, runs TypeScript check, bundles with Vite |
| `npm run dev` | Development server with hot reload |
| `npm run clean` | Removes `dist/` directory |

## Verification

To verify the build is identical to the submitted version:

```bash
npm run clean
npm run build
```

## Notes

- All source files are in `src/` (TypeScript/Preact)
- The extension uses Vite 5 as the bundler
- TypeScript is used only for type-checking (source is bundled by Vite)
- No source files are transpiled, concatenated, or minified outside of the build process
- Third-party libraries are referenced via npm and are not modified
