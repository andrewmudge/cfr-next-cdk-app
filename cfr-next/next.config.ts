import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Chronicle PDF renderer runs in Node route handlers; don't bundle it.
  serverExternalPackages: ['@react-pdf/renderer'],
  // pdfkit loads its built-in fonts (Helvetica, Times…) with a dynamic require that
  // file tracing can't see, so ship them with the routes that build the PDF.
  outputFileTracingIncludes: {
    // ...plus the logo on the cover, read from public/ at runtime.
    '/api/admin/chronicle/**': ['./node_modules/pdfkit/js/standard-fonts/**/*', './public/favicon.png'],
  },
};

export default nextConfig;
