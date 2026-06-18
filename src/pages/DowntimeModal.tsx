import { useState } from 'react';
import toast from 'react-hot-toast';
import { Modal } from '../components/Modal';
import { fp } from '../lib/fp';
import type { DowntimeReason, PressWithLoad } from '../../shared/types';

const REASONS: DowntimeReason[] = [
  'Electrical',
  'Hydraulic',
  'Mechanical',
  'Die',
  'Operator',
  'Power',
  'Other',
];

export function DowntimeModal({
  open,
  press,
  onClose,
  onSaved,
}: {
  open: boolean;
  press: PressWithLoad;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [reason, setReason] = useState<DowntimeReason>('Mechanical');
  const [notes, setNotes] = useState('');
  const [expected, setExpected] = useState('');

  const submit = async () => {
    await fp.invoke(fp.channels.DOWNTIME_CREATE, {
      press_id: press.id,
      reason,
      notes,
      expected_restoration_datetime: expected || null,
    });
    toast.success(`${press.code} marked Down`);
    setNotes('');
    setExpected('');
    setReason('Mechanical');
    onSaved();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Mark ${press.code} as Down`}
      subtitle="Log the breakdown so we can re-route affected work"
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button onClick={submit} className="btn-danger">
            Mark Down & continue
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <div className="field-label">Reason</div>
          <div className="grid grid-cols-4 gap-2">
            {REASONS.map((r) => (
              <button
                key={r}
                onClick={() => setReason(r)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold border transition ${
                  reason === r
                    ? 'bg-steel-900 text-white border-steel-900'
                    : 'bg-white text-steel-700 border-steel-200 hover:bg-steel-50'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="field-label">Notes (optional)</div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What happened? Any tags on parts/jobs in progress..."
            className="input min-h-[80px] resize-y"
          />
        </div>
        <div>
          <div className="field-label">Expected restoration</div>
          <input
            type="datetime-local"
            value={expected}
            onChange={(e) => setExpected(e.target.value)}
            className="input"
          />
        </div>
      </div>
    </Modal>
  );
}
