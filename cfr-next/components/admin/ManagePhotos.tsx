import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface Photo {
  id: string;
  url: string;
  caption?: string;
  uploader?: string;
  date?: string;
  year?: number;
  key: string;
}

export default function ManagePhotos() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [year, setYear] = useState<string>('all');
  const yearOptions = [
    { label: 'All', value: 'all' },
    { label: '2025', value: '2025' },
    { label: '2024', value: '2024' },
    { label: '2023', value: '2023' },
    { label: 'Oldies', value: 'Oldies' },
  ];

  // Fetch photos for selected year/folder
  useEffect(() => {
    setLoading(true);
    let url = process.env.NEXT_PUBLIC_LIST_LAMBDA_URL!;
    if (year !== 'all') {
      url += `?year=${year === 'Oldies' ? 'Nan' : year}`;
    }
    fetch(url)
      .then(res => res.json())
      .then(data => {
        const arr = Array.isArray(data) ? data : data.photos;
        setPhotos(
          arr.map((p: any) => ({ ...p, key: p.url.split('.com/')[1] }))
        );
      })
      .catch(() => toast.error('Failed to load photos'))
      .finally(() => setLoading(false));
  }, [year]);

  // Select/deselect photos
  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Delete selected photos
  const handleDelete = async () => {
    if (selected.size === 0) return;
    setDeleting(true);
    try {
      const res = await fetch('/api/photos/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys: photos.filter(p => selected.has(p.id)).map(p => p.key) })
      });
      if (!res.ok) throw new Error('Delete failed');
      toast.success('Photos deleted');
      setPhotos(photos.filter(p => !selected.has(p.id)));
      setSelected(new Set());
    } catch {
      toast.error('Failed to delete photos');
    } finally {
      setDeleting(false);
    }
  };

  // Upload photo
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    // Send year/folder with upload
    formData.append('year', year === 'Oldies' ? 'Nan' : year);
    try {
      const res = await fetch('/api/photos/upload', {
        method: 'POST',
        body: formData
      });
      if (!res.ok) throw new Error('Upload failed');
      const newPhoto = await res.json();
      setPhotos([newPhoto, ...photos]);
      toast.success('Photo uploaded');
    } catch {
      toast.error('Failed to upload photo');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
      <h2 className="text-xl font-bold text-white mb-4">Manage Photos</h2>
      <div className="mb-4 flex gap-2 items-center">
        <select
          value={year}
          onChange={e => setYear(e.target.value)}
          className="bg-slate-700 text-white border border-slate-600 rounded px-2 py-1"
        >
          {yearOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <Button asChild className="bg-green-600 hover:bg-green-700 text-white" disabled={uploading}>
          <label>
            Upload Photo
            <input type="file" accept="image/*" hidden onChange={handleUpload} />
          </label>
        </Button>
        <Button onClick={handleDelete} disabled={deleting || selected.size === 0} className="bg-red-600 hover:bg-red-700 text-white">
          {deleting ? 'Deleting...' : `Delete Selected (${selected.size})`}
        </Button>
      </div>
      {loading ? (
        <div className="text-gray-400">Loading photos...</div>
      ) : photos.length === 0 ? (
        <div className="text-gray-400">No photos found.</div>
      ) : (
        <div className="grid grid-cols-8 lg:grid-cols-16 gap-2">
          {photos.map(photo => (
            <div key={photo.id} className={`relative border rounded-lg overflow-hidden ${selected.has(photo.id) ? 'border-red-500' : 'border-slate-600'}`}>
              <img src={photo.url} alt={photo.caption || photo.id} className="w-full h-16 object-cover" />
              <div className="absolute top-1 right-1">
                <input type="checkbox" checked={selected.has(photo.id)} onChange={() => toggleSelect(photo.id)} />
              </div>
              <div className="p-1 text-xs text-white bg-slate-900/70 truncate">
                {photo.caption || photo.id}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
