'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

const RulesModal = ({
  title,
  rules,
  linkClassName,
}: {
  title: string;
  rules: string;
  linkClassName?: string;
}) => {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className={linkClassName ?? 'text-blue-600 underline text-sm font-medium hover:text-blue-800'}
        >
          Official Rules
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="whitespace-pre-line text-sm text-slate-700 leading-relaxed">
          {rules}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RulesModal;
