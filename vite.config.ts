import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
  },
  server: {
    host: true,
    allowedHosts: [
      "dallyingly-cisternal-loida.ngrok-free.dev"
    ]
  }
})