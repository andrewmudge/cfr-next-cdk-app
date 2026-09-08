'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CreditCard, ClipboardList, Coffee } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Image from 'next/image';

const REUNION_KICKOFF_DATE = new Date('2027-09-03T00:00:00');

const getDaysUntil = () => {
  const now = new Date();
  const diffMs = REUNION_KICKOFF_DATE.getTime() - now.setHours(0, 0, 0, 0);
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
};

const CountdownPopup = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [daysLeft, setDaysLeft] = useState(getDaysUntil());

  useEffect(() => {
    setDaysLeft(getDaysUntil());
    const timer = setTimeout(() => setIsOpen(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  const close = () => setIsOpen(false);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={close}
        >
          <motion.div
            className="relative bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="relative bg-gradient-to-br from-slate-800 via-slate-700 to-slate-900 p-6 text-center">
              <button
                onClick={close}
                aria-label="Close"
                className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="w-16 h-16 mx-auto mb-4 bg-white rounded-full flex items-center justify-center border-2 border-red-600 shadow-lg">
                <Image
                  src="/favicon.png"
                  alt="Churchwell Family Logo"
                  width={48}
                  height={48}
                  className="w-12 h-12 object-contain"
                />
              </div>

              <div className="text-4xl font-bold text-transparent bg-gradient-to-r from-red-400 via-red-500 to-red-600 bg-clip-text">
                {daysLeft}
              </div>
              <p className="text-white text-lg font-semibold mt-1">
                Days Until the 60th Churchwell Family Reunion
              </p>
            </div>

            {/* CTAs */}
            <div className="p-6 space-y-3">
              <Button
                size="lg"
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-full shadow-md"
                onClick={() => window.open('https://venmo.com/churchwellreunion', '_blank', 'noopener,noreferrer')}
              >
                <CreditCard className="w-5 h-5 mr-2" />
                Pay Dues
              </Button>
              <Button
                size="lg"
                className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white rounded-full shadow-md"
                onClick={() =>
                  window.open(
                    'https://docs.google.com/forms/d/e/1FAIpQLSd40IpAumaAM1-5X9Ed2dgnsJ-4FwKtHO7tL_jA_A8no-ZRMQ/viewform',
                    '_blank',
                    'noopener,noreferrer'
                  )
                }
              >
                <ClipboardList className="w-5 h-5 mr-2" />
                Activity Signup
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="w-full border-2 border-green-500 text-green-600 hover:bg-green-500 hover:text-white rounded-full shadow-md"
                onClick={() =>
                  window.open(
                    'https://docs.google.com/spreadsheets/d/12ID446gBZYEo91Zmj_tlLxvkbo3RoQgyQRJA375kBrE/edit?pli=1&gid=0#gid=0',
                    '_blank',
                    'noopener,noreferrer'
                  )
                }
              >
                <Coffee className="w-5 h-5 mr-2" />
                Brunch Sign Up
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default CountdownPopup;
