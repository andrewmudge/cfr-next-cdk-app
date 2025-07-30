
// Carousel component for flyer images
const flyerImages = [
  '/cfr-flyer-1.png',
  '/cfr-flyer-2.png',
  '/cfr-flyer-3.png',
  '/cfr-flyer-4.png',
  '/cfr-flyer-5.png',
];

const Carousel: React.FC = () => {
  const [current, setCurrent] = useState(0);
  const total = flyerImages.length;

  // Preload all images on mount
  React.useEffect(() => {
    flyerImages.forEach((src) => {
      const img = new window.Image();
      img.src = src;
    });
  }, []);

  const prev = () => setCurrent((prev) => (prev === 0 ? total - 1 : prev - 1));
  const next = () => setCurrent((prev) => (prev === total - 1 ? 0 : prev + 1));

  return (
    <div className="relative flex items-center justify-center rounded-xl shadow-lg overflow-hidden border border-slate-200 bg-white min-h-[400px]">
      <button
        aria-label="Previous page"
        onClick={prev}
        className="absolute left-2 top-1/2 -translate-y-1/2 z-10 bg-white/80 hover:bg-white rounded-full p-2 shadow transition"
      >
        <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
      </button>
      <img
        src={flyerImages[current]}
        alt={`CFR Newsletter page ${current + 1}`}
        className="w-full max-h-[70vh] object-contain bg-white select-none"
        draggable={false}
      />
      <button
        aria-label="Next page"
        onClick={next}
        className="absolute right-2 top-1/2 -translate-y-1/2 z-10 bg-white/80 hover:bg-white rounded-full p-2 shadow transition"
      >
        <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
      </button>
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex space-x-1">
        {flyerImages.map((_, i) => (
          <span
            key={i}
            className={`w-2 h-2 rounded-full ${i === current ? 'bg-red-600' : 'bg-slate-300'}`}
          />
        ))}
      </div>
    </div>
  );
};


import React, { useState } from 'react';



const NewsletterSection = () => {
  return (
    <section id="newsletter" className="py-20 bg-gradient-to-b from-white to-slate-50">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="text-center mb-10">
          <h2 className="text-4xl md:text-5xl font-bold text-slate-800 mb-2">CFR Newsletter</h2>
          <p className="text-lg text-slate-600">2025 Newsletter</p>
        </div>
        {/* Photo Carousel */}
        <Carousel />
        <div className="text-center mt-6">
          <a
            href="/cfr-flyer-2025.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block px-6 py-2 bg-red-600 text-white font-semibold rounded-lg shadow hover:bg-red-700 transition-colors"
          >
            Download PDF
          </a>
        </div>
      </div>
    </section>
  );
};

export default NewsletterSection;
