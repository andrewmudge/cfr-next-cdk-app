import React, { useState } from 'react';

// List of flyer images in order from 25 to 17
const flyerImages = [
  '/Flyers/25.png',
  '/Flyers/24.png',
  '/Flyers/23.jpg',
  '/Flyers/22.jpg',
  '/Flyers/21.jpg',
  '/Flyers/20.jpg',
  '/Flyers/19.jpg',
  '/Flyers/18.jpg',
  '/Flyers/17.jpg',
];

const PastFlyers = () => {
  const [selected, setSelected] = useState(0);
  const total = flyerImages.length;

  // Helper to wrap index
  const wrap = (idx: number) => (idx + total) % total;

  const prev = () => setSelected((prev) => wrap(prev - 1));
  const next = () => setSelected((prev) => wrap(prev + 1));

  // Show a window of 5 flyers, always centering the selected
  const windowSize = Math.min(5, total);
  const half = Math.floor(windowSize / 2);
  // Get indices for the window, wrapping around
  const indices = Array.from({ length: windowSize }, (_, idx) => (selected - half + idx + total) % total);

  return (
    <div className="w-full py-12 flex items-center justify-center bg-gradient-to-b from-white to-slate-50" style={{height: '340px'}}>
      <button
        aria-label="Previous flyer"
        onClick={prev}
        className="mx-2 bg-white/80 hover:bg-white rounded-full p-2 shadow transition z-10"
      >
        <svg className="w-7 h-7 text-red-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
      </button>
      <div className="flex-1 flex items-center justify-center gap-2 md:gap-6 h-full">
        {indices.map((imgIdx, i) => {
          const isSelected = imgIdx === selected;
          const offset = i - half;
          let style = '';
          let z = 0;
          if (isSelected) {
            style = 'scale-110 shadow-2xl border-4 border-red-500';
            z = 20;
          } else {
            style = 'scale-100 opacity-70';
            z = 10 - Math.abs(offset);
          }
          return (
            <img
              key={flyerImages[imgIdx]}
              src={flyerImages[imgIdx]}
              alt={`CFR Flyer ${25 - imgIdx}`}
              className={`transition-all duration-500 ease-in-out rounded-lg bg-white object-contain cursor-pointer ${style}`}
              style={{
                zIndex: z,
                width: isSelected ? '180px' : '140px',
                height: '260px',
                objectFit: 'contain',
                boxShadow: isSelected ? '0 8px 32px rgba(220,38,38,0.15)' : undefined,
                marginLeft: i === 0 ? 'auto' : undefined,
                marginRight: i === windowSize - 1 ? 'auto' : undefined,
              }}
              onClick={() => setSelected(imgIdx)}
            />
          );
        })}
      </div>
      <button
        aria-label="Next flyer"
        onClick={next}
        className="mx-2 bg-white/80 hover:bg-white rounded-full p-2 shadow transition z-10"
      >
        <svg className="w-7 h-7 text-red-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
      </button>
    </div>
  );
};

export default PastFlyers;
