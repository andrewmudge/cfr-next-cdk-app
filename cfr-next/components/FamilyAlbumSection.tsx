'use client';

import { Camera, TreePine, Clock } from 'lucide-react';
import PhotoGallery from '@/components/family/PhotoGallery';
import FamilyTree from '@/components/family/FamilyTree';
import PastReunions from '@/components/family/PastReunions';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const triggerClass =
  'data-[state=active]:bg-white data-[state=active]:text-slate-800 text-slate-600 rounded-lg py-3 px-2 sm:px-6 text-sm sm:text-base transition-all duration-300';

const FamilyAlbumSection = () => {
  return (
    // id="family-only" is kept so previously shared #family-only links still land here.
    <section id="family-only" className="py-20 bg-gradient-to-b from-slate-50 to-white">
      <div id="family-album" className="container mx-auto px-4 scroll-mt-20">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-slate-800 mb-6">Family Album</h2>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            Photos, our family tree, and memories from past reunions.
          </p>
        </div>

        <div className="max-w-6xl mx-auto">
          <Tabs defaultValue="gallery" className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-8 bg-slate-100 rounded-xl p-1 h-auto">
              <TabsTrigger value="gallery" className={triggerClass}>
                <Camera className="w-4 h-4 mr-2 shrink-0" />
                Photos
              </TabsTrigger>
              <TabsTrigger value="tree" className={triggerClass}>
                <TreePine className="w-4 h-4 mr-2 shrink-0" />
                Family Tree
              </TabsTrigger>
              <TabsTrigger value="history" className={triggerClass}>
                <Clock className="w-4 h-4 mr-2 shrink-0" />
                Past Reunions
              </TabsTrigger>
            </TabsList>

            <TabsContent value="gallery" className="mt-0">
              <PhotoGallery />
            </TabsContent>
            <TabsContent value="tree" className="mt-0">
              <FamilyTree />
            </TabsContent>
            <TabsContent value="history" className="mt-0">
              <PastReunions />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </section>
  );
};

export default FamilyAlbumSection;
