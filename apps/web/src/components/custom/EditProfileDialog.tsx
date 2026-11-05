import { useEffect, useRef, useState } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import UserAvatar from '@/components/custom/UserAvatar';
import { useAuthStore } from '@/store/authStore';
import { apiClient, getErrorMessage, mediaUrl } from '@/lib/api';
import type { User } from '@/types';

const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';
const MAX_BYTES = 5 * 1024 * 1024;

const LIMITS = { displayName: 50, bio: 160, location: 30, website: 100 } as const;
type Field = keyof typeof LIMITS;

interface EditProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User;
}

const EditProfileDialog = ({ open, onOpenChange, user }: EditProfileDialogProps) => {
  const setUser = useAuthStore((s) => s.setUser);
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Record<Field, string>>({ displayName: '', bio: '', location: '', website: '' });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const avatarInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setForm({ displayName: user.displayName, bio: user.bio ?? '', location: user.location ?? '', website: user.website ?? '' });
    setAvatarFile(null);
    setCoverFile(null);
  }, [open, user]);

  const [avatarPreview, coverPreview] = useObjectUrls(avatarFile, coverFile);

  const pick = (setter: (f: File) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_BYTES) {
      toast.error('Images must be 5MB or smaller');
      return;
    }
    setter(file);
  };

  const websiteInvalid = form.website.trim() !== '' && !/^https?:\/\//i.test(form.website.trim());
  const invalid = !form.displayName.trim() || websiteInvalid || (Object.keys(LIMITS) as Field[]).some((k) => form[k].length > LIMITS[k]);

  const save = async () => {
    setSaving(true);
    try {
      let updated = await apiClient.updateProfile({
        displayName: form.displayName.trim(),
        bio: form.bio.trim(),
        location: form.location.trim(),
        website: form.website.trim(),
      });
      if (avatarFile) updated = await apiClient.uploadAvatar(avatarFile);
      if (coverFile) updated = await apiClient.uploadCover(coverFile);
      setUser({ ...updated, email: updated.email ?? user.email });
      queryClient.invalidateQueries({ queryKey: ['user', user.handle] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      toast.success('Profile updated');
      onOpenChange(false);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not save your profile'));
    } finally {
      setSaving(false);
    }
  };

  const cover = coverPreview ?? mediaUrl(user.coverImage);

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg p-0 overflow-hidden max-h-[90vh] overflow-y-auto custom-scrollbar">
        <DialogHeader className="px-6 pt-5">
          <DialogTitle>Edit profile</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <button
            type="button"
            onClick={() => coverInput.current?.click()}
            className="group relative block w-full h-36 bg-gradient-to-br from-primary/40 via-accent/30 to-background overflow-hidden"
            aria-label="Change cover image"
          >
            {cover && <img src={cover} alt="" className="w-full h-full object-cover" />}
            <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-70 group-hover:opacity-100 transition-opacity">
              <Camera className="w-6 h-6 text-white" />
            </span>
          </button>
          <button
            type="button"
            onClick={() => avatarInput.current?.click()}
            className="group absolute left-6 -bottom-10 rounded-full ring-4 ring-background"
            aria-label="Change profile photo"
          >
            {avatarPreview ? (
              <img src={avatarPreview} alt="" className="w-20 h-20 rounded-full object-cover" />
            ) : (
              <UserAvatar user={user} className="w-20 h-20" />
            )}
            <span className="absolute inset-0 rounded-full flex items-center justify-center bg-black/45 opacity-70 group-hover:opacity-100 transition-opacity">
              <Camera className="w-5 h-5 text-white" />
            </span>
          </button>
          <input ref={coverInput} type="file" accept={ACCEPT} hidden onChange={pick(setCoverFile)} />
          <input ref={avatarInput} type="file" accept={ACCEPT} hidden onChange={pick(setAvatarFile)} />
        </div>

        <div className="px-6 pt-14 pb-2 space-y-4">
          {(['displayName', 'bio', 'location', 'website'] as const).map((field) => (
            <div key={field} className="space-y-1.5">
              <div className="flex justify-between">
                <Label htmlFor={field}>
                  {{ displayName: 'Name', bio: 'Bio', location: 'Location', website: 'Website' }[field]}
                </Label>
                <span className={`text-xs ${form[field].length > LIMITS[field] ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {form[field].length}/{LIMITS[field]}
                </span>
              </div>
              {field === 'bio' ? (
                <Textarea
                  id={field}
                  value={form.bio}
                  onChange={(e) => setForm({ ...form, bio: e.target.value })}
                  className="resize-none min-h-[88px]"
                  placeholder="Tell people a little about yourself"
                />
              ) : (
                <Input
                  id={field}
                  value={form[field]}
                  onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                  placeholder={field === 'website' ? 'https://yoursite.com' : undefined}
                />
              )}
              {field === 'website' && websiteInvalid && (
                <p className="text-xs text-destructive">Website must start with http:// or https://</p>
              )}
            </div>
          ))}
        </div>

        <DialogFooter className="px-6 pb-5">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || invalid} className="bg-gradient-to-r from-primary to-accent text-white">
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const useObjectUrls = (...files: (File | null)[]) => {
  const [urls, setUrls] = useState<(string | undefined)[]>([]);
  const key = files.map((f) => (f ? `${f.name}:${f.size}:${f.lastModified}` : '')).join('|');

  useEffect(() => {
    const next = files.map((f) => (f ? URL.createObjectURL(f) : undefined));
    setUrls(next);
    return () => next.forEach((u) => u && URL.revokeObjectURL(u));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return urls;
};

export default EditProfileDialog;
