# Portfolio

Personal portfolio, hosted on GitHub Pages. Currently one page: **Coscard: Tayama Edition**, a scroll-driven 3D cosplay business card (Vite + three.js).

## Develop

```bash
npm ci
npm run dev      # http://localhost:5173
npm run build    # outputs dist/ (relative base, works under any Pages path)
```

## Deploy

Push to `main`. `.github/workflows/pages.yml` builds and publishes `dist/`. One-time setup: repo Settings → Pages → Source: **GitHub Actions**.

## Layout

- `index.html`, `src/`: the page
- `public/art/`: card images
