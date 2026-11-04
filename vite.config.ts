import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import { defineConfig, Plugin } from 'vite';

function localPortfolioPlugin(): Plugin {
  return {
    name: 'local-portfolio-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        // Direct reliable static serving for /assets/portfolio/* (images & MP4 videos)
        if (req.url?.startsWith('/assets/portfolio/') && req.method === 'GET') {
          const rawName = req.url.replace('/assets/portfolio/', '').split('?')[0];
          const filePath = path.resolve(process.cwd(), 'public/assets/portfolio', decodeURIComponent(rawName));
          if (fs.existsSync(filePath)) {
            const ext = path.extname(filePath).toLowerCase();
            const mimeMap: Record<string, string> = {
              '.jpg': 'image/jpeg',
              '.jpeg': 'image/jpeg',
              '.png': 'image/png',
              '.webp': 'image/webp',
              '.gif': 'image/gif',
              '.mp4': 'video/mp4',
              '.webm': 'video/webm',
              '.mov': 'video/quicktime',
            };
            res.writeHead(200, {
              'Content-Type': mimeMap[ext] || 'application/octet-stream',
              'Cache-Control': 'no-cache',
            });
            fs.createReadStream(filePath).pipe(res);
            return;
          }
        }

        // Handle listing existing uploaded portfolio files (images & MP4 videos)
        if (req.url === '/api/portfolio/files' && req.method === 'GET') {
          const targetDir = path.resolve(process.cwd(), 'public/assets/portfolio');
          if (fs.existsSync(targetDir)) {
            const files = fs
              .readdirSync(targetDir)
              .filter((f) => !f.startsWith('.') && f !== 'README.txt')
              .map((f) => ({
                filename: f,
                url: `/assets/portfolio/${f}`,
                isVideo: Boolean(f.match(/\.(mp4|webm|mov)$/i)),
              }));
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ files }));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ files: [] }));
          return;
        }

        // Handle saving projects to src/data/portfolioData.ts
        if (req.url === '/api/portfolio/save' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', () => {
            try {
              const { projects } = JSON.parse(body);
              const targetPath = path.resolve(process.cwd(), 'src/data/portfolioData.ts');

              const fileContent = `/**
 * =========================================================================
 * VD CLICKS — PORTFOLIO CONTENT (PATH 1: DIRECT LOCAL PERSISTENCE)
 * Automatically updated via Studio Admin (/admin)
 * =========================================================================
 */

export interface SimpleProjectItem {
  id: string;
  title: string;
  slug: string;
  category: "Weddings" | "Pre-wedding Shoots" | "Half Saree Functions" | "Birthday Functions" | "Album Designing" | "Other Photography";
  shortDescription: string;
  projectDescription?: string;
  location?: string;
  eventDate?: string;
  coverImage: string;
  galleryImages: {
    url: string;
    caption?: string;
  }[];
  videoUrl?: string;
}

export const myPortfolioProjects: SimpleProjectItem[] = ${JSON.stringify(projects, null, 2)};
`;

              fs.writeFileSync(targetPath, fileContent, 'utf-8');

              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, message: 'Saved successfully to src/data/portfolioData.ts' }));
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : String(err);
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: message }));
            }
          });
          return;
        }

        // Handle image & video file uploads directly to /public/assets/portfolio/
        if (req.url === '/api/portfolio/upload' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', () => {
            try {
              const { filename, dataBase64 } = JSON.parse(body);
              const cleanFilename = filename.toLowerCase().replace(/[^a-z0-9.-]/g, '-');
              const targetDir = path.resolve(process.cwd(), 'public/assets/portfolio');
              if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
              }

              const targetFilePath = path.join(targetDir, cleanFilename);
              // Strip any data:...;base64, header (works for image/jpeg, image/png, video/mp4, etc.)
              const base64Data = dataBase64.replace(/^data:[^;]+;base64,/, '');
              fs.writeFileSync(targetFilePath, Buffer.from(base64Data, 'base64'));

              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, url: `/assets/portfolio/${cleanFilename}` }));
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : String(err);
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: message }));
            }
          });
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), localPortfolioPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
