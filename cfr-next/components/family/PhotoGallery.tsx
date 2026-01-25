'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Upload, X, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDropzone } from 'react-dropzone';
import { useInView } from 'react-intersection-observer';
import { fetchPhotos, clearPhotoCache } from '@/lib/s3-utils';

interface Photo {
  id: string;
  url: string;
  thumbnailUrl?: string;
  smallUrl?: string;
  mediumUrl?: string;
  caption: string;
  uploader: string;
  date: string;
  year: number;
  sizes?: string[];
}

const PHOTOS_PER_PAGE = 24; // Increased for better infinite scroll experience

const PhotoGallery = () => {
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [activeYear, setActiveYear] = useState('2026');
  const [photosByYear, setPhotosByYear] = useState<Record<string, Photo[]>>({});
  const [loading, setLoading] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PHOTOS_PER_PAGE);

  const years = [
    { id: '2026', label: '2026', theme: 'TBD', color: 'from-purple-500 to-purple-700' },
    { id: '2025', label: '2025', theme: 'Harry Potter', color: 'from-blue-500 to-blue-700' },
    { id: '2024', label: '2024', theme: 'Captain Ron', color: 'from-red-500 to-red-700' },
    { id: '2023', label: '2023', theme: 'Under the Sea', color: 'from-orange-500 to-orange-700' },
    { id: 'Oldies', label: 'Oldies', theme: 'Mixed Collection', color: 'from-teal-500 to-teal-700' },
  ];

  // Map Oldies to NaN for S3 folder
  const getS3Year = (year: string) => (year === 'Oldies' ? 'NaN' : year);

  const loadPhotos = async (year: string) => {
    try {
      setLoading(true);
      const s3Year = getS3Year(year);
      const photos = await fetchPhotos(s3Year);
      setPhotosByYear(prev => ({ ...prev, [year]: photos }));
    } catch (error) {
      console.error('Failed to load photos:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPhotos(activeYear);
  }, [activeYear]);

  useEffect(() => {
    setVisibleCount(PHOTOS_PER_PAGE); // Reset when year changes
  }, [activeYear]);

  // Infinite scroll with intersection observer
  const { ref: loadMoreRef, inView } = useInView({
    threshold: 0,
    rootMargin: '200px'
  });

  useEffect(() => {
    const currentPhotos = photosByYear[activeYear] || [];
    if (inView && visibleCount < currentPhotos.length && !loading) {
      setVisibleCount(prev => Math.min(prev + PHOTOS_PER_PAGE, currentPhotos.length));
    }
  }, [inView, visibleCount, photosByYear, activeYear, loading]);

  const onDrop = async (acceptedFiles: File[]) => {
    for (const file of acceptedFiles) {
      try {
        setLoading(true);
        const metadata = {
          caption: file.name.replace(/\.[^/.]+$/, ""),
          uploader: 'You',
          date: new Date().toISOString().split('T')[0],
        };
        const formData = new FormData();
        formData.append('file', file);
        formData.append('year', getS3Year(activeYear));
        formData.append('metadata', JSON.stringify(metadata));
        await fetch('/api/photos/upload', {
          method: 'POST',
          body: formData,
        });
        // Clear cache to ensure fresh data
        clearPhotoCache(getS3Year(activeYear));
        await loadPhotos(activeYear);
      } catch (error) {
        console.error('Upload failed:', error);
      } finally {
        setLoading(false);
      }
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.gif'],
    },
    multiple: true,
  });

  const currentYearData = years.find(y => y.id === activeYear);
  const currentPhotos = photosByYear[activeYear] || [];
  const visiblePhotos = currentPhotos.slice(0, visibleCount);

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <h3 className="text-2xl font-bold text-slate-800 mb-4">
          Family Photo Gallery
        </h3>
        <p className="text-slate-600">
          Share and explore memories from our family reunions across the years
        </p>
      </motion.div>

      {/* Year Tabs */}
      <Tabs value={activeYear} onValueChange={setActiveYear} className="w-full">
        <TabsList className="grid w-full grid-cols-5 mb-8 bg-slate-100 rounded-xl p-1">
          {years.map((year) => (
            <TabsTrigger
              key={year.id}
              value={year.id}
              className="data-[state=active]:bg-white data-[state=active]:text-slate-800 text-slate-600 rounded-lg py-3 px-4 transition-all duration-300"
            >
              <div className="text-center">
                <div className="font-bold">{year.label}</div>
                <div className="text-xs opacity-70">{year.theme}</div>
              </div>
            </TabsTrigger>
          ))}
        </TabsList>

        {years.map((year) => {
          const currentPhotos = photosByYear[year.id] || [];
          const visiblePhotos = currentPhotos.slice(0, visibleCount);

          return (
            <TabsContent key={year.id} value={year.id} className="mt-0">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="space-y-8"
              >
                {/* Year Header */}
                <div className={`bg-gradient-to-r ${year.color} text-white p-6 rounded-xl shadow-lg`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-2xl font-bold mb-2">{year.label} Reunion</h4>
                      <p className="text-white/90">{year.theme}</p>
                    </div>
                    <div className="text-right">
                      <Calendar className="w-8 h-8 mb-2 mx-auto" />
                      <div className="text-sm">
                        {currentPhotos.length} photo{currentPhotos.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Upload Area */}
                <motion.div
                  className="
                    border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all duration-300
                    hover:scale-105 max-w-md mx-auto
                  "
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div {...getRootProps()} className="w-full h-full flex flex-col items-center justify-center">
                    <input {...getInputProps()} />
                    <Upload className="w-8 h-8 text-blue-500 mx-auto mb-2" />
                    <h5 className="text-slate-800 font-semibold text-base mb-1">
                      {isDragActive ? `Drop ${year.label} photos here!` : `Upload ${year.label} Photos`}
                    </h5>
                    <p className="text-slate-600 text-sm">
                      Drag & drop or click to browse
                    </p>
                    <p className="text-slate-500 text-xs mt-1">
                      Photos will be added to the {year.label} reunion gallery
                    </p>
                  </div>
                </motion.div>

                {/* Photo Grid */}
                {currentPhotos.length > 0 ? (
                  <>
                    <div className="grid grid-cols-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                      {visiblePhotos.map((photo, index) => (
                        <motion.div
                          key={photo.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.5, delay: Math.min(index * 0.05, 1) }}
                          className="bg-white rounded-xl overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300 group cursor-pointer"
                          whileHover={{ y: -5, scale: 1.02 }}
                          onClick={() => setSelectedPhoto(photo.url)}
                        >
                          <div className="relative aspect-square">
                            {/* Blur placeholder - thumbnail */}
                            {photo.thumbnailUrl && (
                              <img
                                src={photo.thumbnailUrl}
                                alt=""
                                className="absolute inset-0 w-full h-full object-cover blur-sm transition-opacity duration-500"
                                loading="eager"
                              />
                            )}
                            {/* Progressive load - small size for grid, medium for modal */}
                            <img
                              src={photo.smallUrl || photo.url}
                              alt={photo.caption || "Family reunion memory"}
                              className="relative w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              loading="lazy"
                              onLoad={(e) => {
                                const target = e.currentTarget;
                                const prev = target.previousElementSibling as HTMLElement;
                                if (prev) prev.style.opacity = '0';
                              }}
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                          </div>
                        </motion.div>
                      ))}
                    </div>
                    {/* Infinite scroll trigger */}
                    {currentPhotos.length > visibleCount && (
                      <div ref={loadMoreRef} className="h-20 flex items-center justify-center mt-4">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-12">
                    <Calendar className="w-16 h-16 text-slate-400 mx-auto mb-4" />
                    <h5 className="text-xl font-semibold text-slate-800 mb-2">
                      No photos yet for {year.label}
                    </h5>
                    <p className="text-slate-600">
                      Be the first to upload memories from the {year.label} reunion!
                    </p>
                  </div>
                )}
              </motion.div>
            </TabsContent>
          );
        })}
      </Tabs>

      {/* Photo Modal */}
      {selectedPhoto && (
        <motion.div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setSelectedPhoto(null)}
        >
          <motion.div
            className="relative max-w-4xl max-h-[90vh] w-full"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            onClick={(e: React.MouseEvent<HTMLDivElement>) => e.stopPropagation()}
          >
            <img
              src={selectedPhoto}
              alt="Full size"
              className="w-full h-full object-contain rounded-lg"
            />
            <button
              onClick={() => setSelectedPhoto(null)}
              className="absolute top-4 right-4 w-10 h-10 bg-black/50 rounded-full flex items-center justify-center text-white hover:bg-black/70 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </motion.div>
        </motion.div>
      )}

      {/* Gallery Statistics 
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.8 }}
        className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-12"
      >
        {years.map((year) => {
          const yearPhotos = photosByYear[year.id] || [];
          
          return (
            <div
              key={year.id}
              className="bg-white p-4 rounded-xl text-center border border-slate-200 shadow-sm"
            >
              <div className="text-2xl font-bold text-slate-800">{yearPhotos.length}</div>
              <div className="text-slate-600 text-sm">{year.label} Photos</div>
            </div>
          );
        })}
      </motion.div> */}
    </div>
  );
};

export default PhotoGallery;