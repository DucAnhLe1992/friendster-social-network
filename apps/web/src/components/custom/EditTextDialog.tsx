import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface EditTextDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  initialValue: string;
  maxLength: number;
  allowEmpty?: boolean;
  onSave: (value: string) => Promise<void>;
}

const EditTextDialog = ({ open, onOpenChange, title, initialValue, maxLength, allowEmpty, onSave }: EditTextDialogProps) => {
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setValue(initialValue);
  }

  const trimmed = value.trim();
  const invalid = value.length > maxLength || (!allowEmpty && !trimmed) || trimmed === initialValue.trim();

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(trimmed);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="min-h-[120px] resize-none"
          autoFocus
          disabled={saving}
        />
        <p className={`text-xs text-right ${value.length > maxLength ? 'text-destructive' : 'text-muted-foreground'}`}>
          {value.length}/{maxLength}
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || invalid}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditTextDialog;
