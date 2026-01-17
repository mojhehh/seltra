# Seltra Bookmarklets

A collection of powerful bookmarklets to enhance your browsing experience.

## Development

### Prerequisites
- Node.js 18+
- npm

### Setup
```bash
npm install
```

### Build Commands

| Command | Description |
|---------|-------------|
| `npm run build` | Build precompiled version to dist/ |
| `npm run build:prod` | Build minified production version |
| `npm run serve` | Serve dist/ locally on port 3333 |
| `npm run dev` | Run Vite dev server |

### How it works

The source code lives in `index.html` with JSX that's transpiled at build time:

1. `extract-jsx.js` extracts JSX from `index.html` → `src/app.jsx`
2. `build.js` compiles JSX to JS using esbuild (fast!)
3. Output goes to `dist/index.html` (no Babel needed at runtime)

### Deploying

Deploy `dist/index.html` - it's self-contained and has no runtime dependencies on Babel.

---

© 2025 Seltra. All rights reserved.
