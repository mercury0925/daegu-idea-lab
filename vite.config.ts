import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
export default defineConfig({ base: '/daegu-idea-lab/', plugins: [tailwindcss()] })
