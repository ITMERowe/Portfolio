# Architecture

- Static site, built by Vite (`npm run build --base=./`), served by GitHub Pages.
- Root `index.html` is the Coscard page. `src/main.js` (three.js scene, scroll-driven) and `src/style.css`.
- Images in `public/art/`.
- Deploy: `.github/workflows/pages.yml` on push to `main`.
- Additional pages: pending. Rule: each page is its own HTML entry in `vite.config.js` (`build.rollupOptions.input`); only pages that need three.js import it. Never merge pages into one bundle.
