import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Chronicle PDF renderer runs in Node route handlers; don't bundle it.
  serverExternalPackages: ['@react-pdf/renderer'],
  // pdfkit loads its built-in fonts (Helvetica, Times…) with a dynamic require that
  // file tracing can't see, so ship them with the routes that build the PDF.
  outputFileTracingIncludes: {
    '/api/admin/chronicle/**': ['./node_modules/pdfkit/js/standard-fonts/**/*'],
  },
};

export default nextConfig;
