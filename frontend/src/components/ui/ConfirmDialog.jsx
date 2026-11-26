import { useState } from 'react';
import { Modal } from './Modal.jsx';
import { Button } from './Button.jsx';
import { Textarea } from './Field.jsx';

/** Confirmation with an optional reason field; onConfirm may be async. */
export function ConfirmDialog({ open, onClose, onConfirm, title, description, confirmLabel = 'Confirm', tone = 'danger', withReason, reasonLabel = 'Reason (optional)', children }) {
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const close = () => { if (!busy) { setReason(''); onClose(); } };
  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm(reason.trim() || undefined);
      setReason('');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      size="sm"
      closeDisabled={busy}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>Keep it</Button>
          <Button variant={tone === 'danger' ? 'danger-solid' : 'primary'} onClick={confirm} loading={busy}>{confirmLabel}</Button>
        </>
      }
    >
      {description && <p className="text-sm text-ink-600">{description}</p>}
      {children}
      {withReason && (
        <div className="mt-4">
          <Textarea label={reasonLabel} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} rows={2} placeholder="Shared with the other person" />
        </div>
      )}
    </Modal>
  );
}
