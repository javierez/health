/** @type {import("next").NextConfig} */
const config = {
  typescript: { ignoreBuildErrors: false },
  // The panel's chat sends a voice note or a resized photo to a server action
  // (1 MB by default). Vercel's own cap is 4.5 MB.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  // The chat reads a training video by cutting it into frames. ffmpeg is a
  // 45 MB binary, so it is loaded with `import()` and traced into the one
  // route that needs it, not into every function. By its real path in .pnpm:
  // through the `node_modules/ffmpeg-static` symlink Vercel refuses the
  // function («invalid deployment package… symlinked directories», 18-oct-2026).
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: {
    "/api/webhooks/whatsapp/*": ["./node_modules/.pnpm/ffmpeg-static@*/node_modules/ffmpeg-static/ffmpeg"],
  },
};

export default config;
