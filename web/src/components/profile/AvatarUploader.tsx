import { useCallback, useRef, useState } from 'react';
import { Pencil, Upload, Trash2 } from 'lucide-react';
import Cropper, { type Area } from 'react-easy-crop';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { api, parseApiError } from '../../api';
import { getCroppedBlob } from '../../lib/crop';
import { publicFileUrl } from '../../lib/files';

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'];

export type AvatarUploaderProps = {
  /** Current avatar URL stored on the profile (relative `/uploads/...` or absolute). */
  avatarUrl: string | null | undefined;
  /** Initials shown in the avatar fallback. */
  fallback: string;
  /** Called after a successful upload or removal so the parent can refetch. */
  onChanged: () => void | Promise<void>;
  /**
   * Upwork-style compact trigger: a small circular avatar with a pencil overlay.
   * Clicking opens a "Manage photo" dialog instead of rendering the dropzone
   * and Replace / Remove buttons inline. The crop dialog flow is unchanged.
   */
  compact?: boolean;
  /** Tailwind size classes for the avatar in compact mode. Default `h-20 w-20`. */
  compactClassName?: string;
};

type Stage = 'idle' | 'cropping' | 'uploading' | 'removing';

export function AvatarUploader({
  avatarUrl,
  fallback,
  onChanged,
  compact = false,
  compactClassName,
}: AvatarUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  // Crop state
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageMime, setImageMime] = useState<string>('image/jpeg');
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

  const renderedUrl = publicFileUrl(avatarUrl);

  function reset() {
    setImageSrc(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setStage('idle');
  }

  function validateFile(file: File): string | null {
    if (!ALLOWED_MIMES.includes(file.type)) {
      return 'Use a JPEG, PNG, or WebP image.';
    }
    if (file.size > MAX_AVATAR_BYTES) {
      return 'File is too large. Max 5 MB for avatars.';
    }
    return null;
  }

  function pickFile(file: File | undefined | null) {
    if (!file) return;
    setError('');
    const problem = validateFile(file);
    if (problem) {
      setError(problem);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImageSrc(reader.result as string);
      setImageMime(
        file.type === 'image/png' || file.type === 'image/webp'
          ? file.type
          : 'image/jpeg',
      );
      setStage('cropping');
      // Close the compact "Manage photo" dialog so the crop dialog has the stage to itself.
      setManageOpen(false);
    };
    reader.onerror = () => setError('Could not read this file.');
    reader.readAsDataURL(file);
  }

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  async function save() {
    if (!imageSrc || !croppedAreaPixels) return;
    setStage('uploading');
    setError('');
    setStatus('Uploading…');
    try {
      const blob = await getCroppedBlob(
        imageSrc,
        croppedAreaPixels,
        imageMime as 'image/jpeg' | 'image/png' | 'image/webp',
      );
      const ext =
        imageMime === 'image/png'
          ? 'png'
          : imageMime === 'image/webp'
            ? 'webp'
            : 'jpg';
      const formData = new FormData();
      formData.append('file', blob, `avatar.${ext}`);
      await api<{ avatar_url: string }>('/client-profiles/me/avatar', {
        method: 'POST',
        body: formData,
      });
      setStatus('Uploaded.');
      await onChanged();
      reset();
    } catch (err) {
      const parsed = parseApiError(err);
      setError(parsed?.message ?? 'Upload failed.');
      setStage('cropping');
      setStatus('');
    }
  }

  async function remove() {
    setStage('removing');
    setError('');
    setStatus('Removing…');
    try {
      await api('/client-profiles/me', {
        method: 'PATCH',
        body: JSON.stringify({ avatar_url: '' }),
      });
      setStatus('Removed.');
      await onChanged();
      setStage('idle');
    } catch (err) {
      const parsed = parseApiError(err);
      setError(parsed?.message ?? 'Could not remove avatar.');
      setStage('idle');
      setStatus('');
    }
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    pickFile(file);
  }

  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(true);
  }

  function onDragLeave() {
    setDragOver(false);
  }

  function onPickerKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInputRef.current?.click();
    }
  }

  const fileInputEl = (
    <input
      ref={fileInputRef}
      type="file"
      accept="image/jpeg,image/png,image/webp"
      className="sr-only"
      onChange={(e) => {
        pickFile(e.target.files?.[0]);
        e.target.value = '';
      }}
    />
  );

  const cropDialog = (
    <Dialog
      open={stage === 'cropping' || stage === 'uploading'}
      onOpenChange={(open) => {
        if (!open && stage !== 'uploading') reset();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit photo</DialogTitle>
          <DialogDescription>
            Drag to reposition · pinch or use the slider to zoom.
          </DialogDescription>
        </DialogHeader>
        <div className="relative h-72 w-full overflow-hidden rounded-md bg-subtle">
          {imageSrc ? (
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          ) : null}
        </div>
        <div className="space-y-2">
          <label htmlFor="avatar-zoom" className="text-sm font-medium text-fg">
            Zoom
          </label>
          <input
            id="avatar-zoom"
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-full accent-primary"
          />
        </div>
        <DialogFooter className="flex flex-row-reverse gap-2">
          <Button
            type="button"
            onClick={save}
            disabled={stage === 'uploading' || !croppedAreaPixels}
          >
            {stage === 'uploading' ? 'Uploading…' : 'Save photo'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={reset}
            disabled={stage === 'uploading'}
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (compact) {
    return (
      <>
        <div className="relative inline-block">
          <Avatar className={cn('h-20 w-20', compactClassName)}>
            {renderedUrl ? (
              <AvatarImage src={renderedUrl} alt="Current avatar" />
            ) : null}
            <AvatarFallback className="text-base">{fallback}</AvatarFallback>
          </Avatar>
          <button
            type="button"
            aria-label="Edit photo"
            onClick={() => setManageOpen(true)}
            className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full border-2 border-raised bg-primary text-primary-fg shadow-sm transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </div>

        {fileInputEl}

        <Dialog
          open={manageOpen}
          onOpenChange={(open) => {
            if (!open && stage === 'removing') return;
            setManageOpen(open);
            if (!open) setError('');
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Photo</DialogTitle>
              <DialogDescription>
                Square photo, ≥ 256×256 px. JPEG, PNG, or WebP up to 5 MB.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4 py-2">
              <Avatar className="h-32 w-32">
                {renderedUrl ? (
                  <AvatarImage src={renderedUrl} alt="Current avatar" />
                ) : null}
                <AvatarFallback className="text-2xl">{fallback}</AvatarFallback>
              </Avatar>
              {error ? (
                <p
                  role="alert"
                  className="w-full rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
                >
                  {error}
                </p>
              ) : null}
            </div>
            <DialogFooter className="flex flex-row-reverse gap-2 sm:justify-between">
              <Button
                type="button"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload />
                {avatarUrl ? 'Change image' : 'Upload photo'}
              </Button>
              {avatarUrl ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={remove}
                  disabled={stage === 'removing'}
                  className="text-danger hover:text-danger"
                >
                  <Trash2 />
                  {stage === 'removing' ? 'Removing…' : 'Delete current image'}
                </Button>
              ) : null}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {cropDialog}
      </>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4">
        <Avatar className="h-20 w-20">
          {renderedUrl ? (
            <AvatarImage src={renderedUrl} alt="Current avatar" />
          ) : null}
          <AvatarFallback className="text-base">{fallback}</AvatarFallback>
        </Avatar>
        <div
          role="button"
          tabIndex={0}
          aria-label="Drop a photo here, or press Enter to browse"
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={onPickerKeyDown}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          className={`flex min-h-[88px] flex-1 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed px-4 py-3 text-center text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            dragOver
              ? 'border-primary bg-subtle text-primary'
              : 'border-border-default bg-raised text-fg-muted hover:border-border-strong'
          }`}
        >
          <Upload className="h-4 w-4" />
          <span className="font-medium text-fg">Drop a photo here</span>
          <span className="text-xs">JPEG, PNG, or WebP · max 5 MB · ≥ 256×256</span>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(e) => {
            pickFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload />
          {avatarUrl ? 'Replace' : 'Upload'}
        </Button>
        {avatarUrl ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={remove}
            disabled={stage === 'removing'}
          >
            <Trash2 />
            Remove
          </Button>
        ) : null}
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      ) : null}
      <p aria-live="polite" className="sr-only">
        {status}
      </p>

      {cropDialog}
    </div>
  );
}
