import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages project site: https://<user>.github.io/bus-root-viewer/
export default defineConfig({
  plugins: [react()],
  base: '/bus-root-viewer/',
})
