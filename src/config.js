/**
 * config.js — API base URL
 * 
 * Local dev:   calls localhost:8000  (via Vite proxy)
 * Production:  calls your Render backend URL
 * 
 * HOW TO SET:
 *   In Vercel dashboard → Settings → Environment Variables
 *   Add: VITE_API_URL = https://treazy-ai-backend.onrender.com
 *   (replace with your actual Render URL after deploying)
 */
export const API_BASE = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL + "/api"
  : "/api";   // falls back to Vite proxy in local dev
