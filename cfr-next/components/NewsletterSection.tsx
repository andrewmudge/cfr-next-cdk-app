import React from 'react';

const NewsletterSection = () => {
  return (
    <section id="newsletter" className="py-20 bg-gradient-to-b from-white to-slate-50">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="text-center mb-10">
          <h2 className="text-4xl md:text-5xl font-bold text-slate-800 mb-2">CFR Newsletter</h2>
          <p className="text-lg text-slate-600">2025 Newsletter</p>
        </div>
        <div className="rounded-xl shadow-lg overflow-hidden border border-slate-200 bg-white">
          <iframe
            src="/cfr-flyer-2025.pdf"
            title="CFR 2025 Newsletter PDF"
            className="w-full h-[70vh] min-h-[500px]"
            frameBorder="0"
            aria-label="CFR 2025 Newsletter PDF"
          />
        </div>
        <div className="text-center mt-6">
          <a
            href="/cfr-flyer-2025.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg shadow hover:bg-blue-700 transition-colors"
          >
            Download PDF
          </a>
        </div>
      </div>
    </section>
  );
};

export default NewsletterSection;
