import { Archive, Download, FileText, Headphones, Image, LifeBuoy, Send, ShieldAlert, Trash2, Video, X } from 'lucide-react';
import { useState } from 'react';
import { CHAT_MEDIA_LIMITS } from '../utils/mediaCompression';
import './DataSupportSection.css';

const mb = bytes => Math.round(bytes / 1024 / 1024);

export default function DataSupportSection({
  subject,
  details,
  setSubject,
  setDetails,
  busy,
  busyAction,
  onExport,
  onSubmitSupport,
  onDeleteAccount
}) {
  const [showDelete, setShowDelete] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const validSupport = subject.trim().length > 0 && details.trim().length > 0;
  const deletePhrase = 'DELETE MY AAHAT ACCOUNT';

  const closeDelete = () => {
    if (busyAction === 'delete-account') return;
    setShowDelete(false);
    setConfirmation('');
  };

  return <section className="data-support-section">
    <header className="data-support-header">
      <span><LifeBuoy size={23}/></span>
      <div><h3>Data and support</h3><p>Manage your account data, upload limits and support requests.</p></div>
    </header>

    <div className="data-media-grid">
      <article><span><Image size={19}/></span><div><strong>Photos</strong><p>Up to {mb(CHAT_MEDIA_LIMITS.imageInputBytes)}MB. Camera and gallery images are converted to JPG and compressed below {mb(CHAT_MEDIA_LIMITS.imageOutputBytes)}MB.</p></div></article>
      <article><span><Video size={19}/></span><div><strong>Videos</strong><p>Up to {mb(CHAT_MEDIA_LIMITS.videoInputBytes)}MB and {CHAT_MEDIA_LIMITS.videoDurationSeconds / 60} minutes, with compressed uploads up to {mb(CHAT_MEDIA_LIMITS.videoOutputBytes)}MB.</p></div></article>
      <article><span><FileText size={19}/></span><div><strong>Documents</strong><p>Private PDF documents can be shared up to {mb(CHAT_MEDIA_LIMITS.pdfBytes)}MB.</p></div></article>
      <article><span><Headphones size={19}/></span><div><strong>Voice messages</strong><p>Voice notes remain connected to the message lifecycle and are removed with eligible deleted media.</p></div></article>
    </div>

    <div className="data-export-card">
      <span className="data-card-icon"><Archive size={21}/></span>
      <div><strong>Download your Aahat data</strong><p>Create a private JSON copy of your profile, contacts, conversations, sent messages, statuses, calls and support requests.</p></div>
      <button type="button" disabled={busy} onClick={onExport}><Download size={17}/>{busyAction === 'data-export' ? 'Preparing…' : 'Export my data'}</button>
    </div>

    <form className="support-request-card" onSubmit={event => { event.preventDefault(); onSubmitSupport(); }}>
      <div className="support-card-heading"><span className="data-card-icon"><LifeBuoy size={21}/></span><div><strong>Contact support</strong><p>Tell us what happened. Your request will appear securely in the Aahat support queue.</p></div></div>
      <label>Subject<span>{subject.length}/120</span><input value={subject} maxLength={120} autoComplete="off" placeholder="What do you need help with?" onChange={event => setSubject(event.target.value)}/></label>
      <label>Details<span>{details.length}/2000</span><textarea value={details} maxLength={2000} placeholder="Describe the issue and the steps that led to it…" onChange={event => setDetails(event.target.value)}/></label>
      <button type="submit" disabled={busy || !validSupport}><Send size={17}/>{busyAction === 'support-request' ? 'Submitting…' : 'Submit support request'}</button>
    </form>

    <div className="account-danger-zone">
      <span><ShieldAlert size={21}/></span>
      <div><strong>Delete account permanently</strong><p>This permanently removes your Aahat account and cannot be undone.</p></div>
      <button type="button" disabled={busy} onClick={() => setShowDelete(true)}><Trash2 size={16}/>Delete account</button>
    </div>

    {showDelete && <div className="delete-account-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && closeDelete()}>
      <div className="delete-account-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-account-title">
        <button className="delete-dialog-close" type="button" aria-label="Close" onClick={closeDelete}><X size={18}/></button>
        <span className="delete-dialog-icon"><Trash2 size={24}/></span>
        <h4 id="delete-account-title">Permanently delete your account?</h4>
        <p>Your profile and account access will be permanently removed. Type the confirmation phrase below to continue.</p>
        <code>{deletePhrase}</code>
        <input autoFocus value={confirmation} onChange={event => setConfirmation(event.target.value)} placeholder="Type the phrase exactly"/>
        <div className="delete-dialog-actions"><button type="button" onClick={closeDelete}>Cancel</button><button type="button" className="confirm-delete" disabled={busy || confirmation !== deletePhrase} onClick={() => onDeleteAccount(confirmation)}>{busyAction === 'delete-account' ? 'Deleting…' : 'Delete permanently'}</button></div>
      </div>
    </div>}
  </section>;
}
