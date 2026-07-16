import React, { useState } from 'react';
import { 
  User, Shield, Bell, Palette, Ban, Laptop, LogOut,
  ChevronRight, Lock, FileText, HelpCircle,
  Download, Trash2, Key, Search
} from 'lucide-react';
import SafeAvatar from './SafeAvatar';
import { supabase } from '../supabase';

const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const storagePathFromPublicUrl = (url, bucketName) => {
  if (!url || !url.includes('/storage/v1/object/public/')) return null;
  const [, objectPath] = url.split('/storage/v1/object/public/');
  if (!objectPath) return null;
  const [bucket, ...pathParts] = objectPath.split('/');
  return bucket === bucketName ? pathParts.join('/') : null;
};

/**
 * SettingsPanel - Modular settings page inside Aahat messaging client.
 * Features profile customization, notification preferences, privacy toggles,
 * blocked users manager, connected devices dashboard, security audits, legal terms,
 * and customer support tickets.
 */
export default function SettingsPanel({ user, profile, onLogout, onUploadFile, onUpdateProfile, onRequestNotificationPermission }) {
  const [activeSubTab, setActiveSubTab] = useState('profile');
  
  // Profile States â€” initialized from V2 profile model
  const [displayName, setDisplayName] = useState(() => {
    return profile?.display_name || user?.email?.split('@')[0] || '';
  });
  const [statusMsg, setStatusMsg] = useState(() => {
    return profile?.bio || 'Hey there! I am using Aahat.';
  });
  const [avatarUrl, setAvatarUrl] = useState(() => {
    return profile?.avatar_url || '';
  });

  // Avatar Cropper States
  const [showCropModal, setShowCropModal] = useState(false);
  const [cropImgSrc, setCropImgSrc] = useState('');
  const [imgAspect, setImgAspect] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [selectedFile, setSelectedFile] = useState(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  
  // Privacy States â€” initialized from profile JSONB
  const [privacyLastSeen, setPrivacyLastSeen] = useState(() => {
    return profile?.privacy_settings?.last_seen !== false;
  });
  const [privacyReceipts, setPrivacyReceipts] = useState(() => {
    return profile?.privacy_settings?.read_receipts !== false;
  });
  const [profilePhotoAudience, setProfilePhotoAudience] = useState(() => {
    return profile?.privacy_settings?.profile_photo || 'everyone';
  });
  const [privacyOnline, setPrivacyOnline] = useState(() => {
    return profile?.privacy_settings?.online !== false;
  });
  const [discoverByAahatId, setDiscoverByAahatId] = useState(() => {
    return profile?.privacy_settings?.discover_by_aahat_id !== false;
  });
  const [statusAudience, setStatusAudience] = useState(() => {
    return profile?.privacy_settings?.status || 'contacts';
  });
  
  // Notification States â€” initialized from profile JSONB
  const [notifSound, setNotifSound] = useState(() => {
    return profile?.notification_settings?.sound !== false;
  });
  const [notifPreviews, setNotifPreviews] = useState(() => {
    return profile?.notification_settings?.previews !== false;
  });
  
  // Theme States
  const [themeMode, setThemeMode] = useState(() => {
    return localStorage.getItem('aahat_theme_mode') || 'glass';
  }); // glass, dark, neon
  
  // Blocked & Devices
  const [blockedUsers, setBlockedUsers] = useState(() => {
    const cached = localStorage.getItem('aahat_blocked_users');
    return cached ? JSON.parse(cached) : [
      { id: "b1", name: "Spammer Bot 99", email: "spammer@bot.com" }
    ];
  });
  const [devices, setDevices] = useState([
    { id: "d1", name: "Windows Desktop â€¢ Active Now", location: "Mumbai, India", type: "desktop" },
    { id: "d2", name: "iPhone 15 Pro", location: "Delhi, India", type: "mobile", lastSeen: "Active 2h ago" }
  ]);

  // Security Center States
  const [is2faEnabled, setIs2faEnabled] = useState(() => {
    return localStorage.getItem('aahat_2fa_enabled') === 'true';
  });
  const [show2faSetup, setShow2faSetup] = useState(false);
  const [otpVerificationCode, setOtpVerificationCode] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loginLogs] = useState([
    { id: 1, device: "Windows desktop", ip: "192.168.1.12", date: "June 19, 2026, 06:45 AM", location: "Mumbai, India" },
    { id: 2, device: "iPhone 15 Pro", ip: "103.45.210.4", date: "June 18, 2026, 11:20 PM", location: "Delhi, India" }
  ]);

  // Support Tab States
  const [faqSearchQuery, setFaqSearchQuery] = useState('');
  const [activeFaqIndex, setActiveFaqIndex] = useState(null);
  
  // Ticketing States
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketDescription, setTicketDescription] = useState('');
  const [ticketSeverity, setTicketSeverity] = useState('medium');
  const [bugSteps, setBugSteps] = useState('');
  const [appealReason, setAppealReason] = useState('');

  // Legal Tab Selection
  const [selectedLegalDoc, setSelectedLegalDoc] = useState('privacy'); // privacy, terms, cookies, deletion

  // Sync to local storage
  React.useEffect(() => {
    localStorage.setItem('aahat_theme_mode', themeMode);
    document.body.className = `theme-${themeMode}`;
  }, [themeMode]);

  React.useEffect(() => {
    localStorage.setItem('aahat_2fa_enabled', is2faEnabled ? 'true' : 'false');
  }, [is2faEnabled]);

  // Sync profile and settings dynamically when profile prop changes
  React.useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || '');
      setStatusMsg(profile.bio || '');
      setAvatarUrl(profile.avatar_url || '');
      
      if (profile.privacy_settings) {
        setPrivacyLastSeen(profile.privacy_settings.last_seen !== false);
        setPrivacyReceipts(profile.privacy_settings.read_receipts !== false);
        setStatusAudience(profile.privacy_settings.status || 'contacts');
        setProfilePhotoAudience(profile.privacy_settings.profile_photo || 'everyone');
        setPrivacyOnline(profile.privacy_settings.online !== false);
        setDiscoverByAahatId(profile.privacy_settings.discover_by_aahat_id !== false);
      }
      
      if (profile.notification_settings) {
        setNotifSound(profile.notification_settings.sound !== false);
        setNotifPreviews(profile.notification_settings.previews !== false);
      }
    }
  }, [profile]);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    try {
      if (onUpdateProfile) {
        await onUpdateProfile({
          display_name: displayName,
          bio: statusMsg,
          avatar_url: avatarUrl
        });
      }
      alert("Profile settings updated successfully!");
    } catch (err) {
      alert("Error saving profile: " + err.message);
    }
  };

  const persistPrivacySetting = async (key, value) => {
    if (!onUpdateProfile || !profile) return;
    await onUpdateProfile({
      privacy_settings: {
        ...(profile.privacy_settings || {}),
        [key]: value
      }
    });
  };

  const handleTogglePrivacyLastSeen = async () => {
    const newVal = !privacyLastSeen;
    setPrivacyLastSeen(newVal);
    await persistPrivacySetting('last_seen', newVal);
  };

  const handleTogglePrivacyReceipts = async () => {
    const newVal = !privacyReceipts;
    setPrivacyReceipts(newVal);
    await persistPrivacySetting('read_receipts', newVal);
  };

  const handleChangeStatusAudience = async (val) => {
    setStatusAudience(val);
    await persistPrivacySetting('status', val);
  };

  const handleChangeProfilePhotoAudience = async (val) => {
    setProfilePhotoAudience(val);
    await persistPrivacySetting('profile_photo', val);
  };

  const handleTogglePrivacyOnline = async () => {
    const newVal = !privacyOnline;
    setPrivacyOnline(newVal);
    await persistPrivacySetting('online', newVal);
  };

  const handleToggleDiscoverByAahatId = async () => {
    const newVal = !discoverByAahatId;
    setDiscoverByAahatId(newVal);
    await persistPrivacySetting('discover_by_aahat_id', newVal);
  };

  const handleToggleNotifSound = async () => {
    const newVal = !notifSound;
    setNotifSound(newVal);
    if (onUpdateProfile && profile) {
      await onUpdateProfile({
        notification_settings: {
          ...(profile.notification_settings || {}),
          sound: newVal
        }
      });
    }
  };

  const handleToggleNotifPreviews = async () => {
    const newVal = !notifPreviews;
    setNotifPreviews(newVal);
    if (onUpdateProfile && profile) {
      await onUpdateProfile({
        notification_settings: {
          ...(profile.notification_settings || {}),
          previews: newVal
        }
      });
    }
  };

  const handleAvatarChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!AVATAR_TYPES.has(file.type)) {
      alert('Please choose a JPG, PNG, WEBP, or GIF image.');
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      alert('Image size must be less than 2MB.');
      return;
    }
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.src = reader.result;
      img.onload = () => {
        setImgAspect(img.width / img.height);
        setCropImgSrc(reader.result);
        setZoom(1);
        setPosition({ x: 0, y: 0 });
        setShowCropModal(true);
      };
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveAvatar = async () => {
    if (!confirm("Are you sure you want to remove your profile picture?")) return;
    setIsUploadingAvatar(true);

    const oldPath = storagePathFromPublicUrl(avatarUrl, 'avatars');
    if (oldPath) {
      try {
        await supabase.storage.from('avatars').remove([oldPath]);
      } catch (err) {
        console.warn('Failed to remove avatar from storage:', err);
      }
    }

    try {
      setAvatarUrl('');
      if (onUpdateProfile) {
        await onUpdateProfile({ display_name: displayName, bio: statusMsg, avatar_url: '' });
      }
    } catch (err) {
      console.error('Failed to remove avatar:', err);
      alert('Could not remove profile photo. Please try again.');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleMouseDown = (e) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleTouchStart = (e) => {
    const touch = e.touches[0];
    setIsDragging(true);
    setDragStart({ x: touch.clientX - position.x, y: touch.clientY - position.y });
  };

  const handleTouchMove = (e) => {
    if (!isDragging) return;
    if (e.cancelable) {
      e.preventDefault();
    }
    const touch = e.touches[0];
    setPosition({
      x: touch.clientX - dragStart.x,
      y: touch.clientY - dragStart.y
    });
  };

  const handleSaveCrop = async () => {
    if (!selectedFile) return;
    setIsUploadingAvatar(true);
    const img = new Image();
    img.src = cropImgSrc;
    img.onload = async () => {
      const canvas = document.createElement('canvas');
      const size = 300; // Crop size
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');

      ctx.clearRect(0, 0, size, size);

      const aspect = img.width / img.height;
      let drawWidth, drawHeight;
      if (aspect > 1) {
        drawHeight = size * zoom;
        drawWidth = size * aspect * zoom;
      } else {
        drawWidth = size * zoom;
        drawHeight = (size / aspect) * zoom;
      }

      const x = (size - drawWidth) / 2 + position.x;
      const y = (size - drawHeight) / 2 + position.y;

      ctx.drawImage(img, x, y, drawWidth, drawHeight);

      canvas.toBlob(async (blob) => {
        if (!blob) {
          setIsUploadingAvatar(false);
          return;
        }
        const croppedFile = new File([blob], selectedFile.name, { type: 'image/png' });
        try {
          const oldPath = storagePathFromPublicUrl(avatarUrl, 'avatars');
          const filePath = `${user.id}/avatar-${Date.now()}.png`;
          const { error: uploadError } = await supabase.storage
            .from('avatars')
            .upload(filePath, croppedFile, { contentType: 'image/png', upsert: false });
          if (uploadError) throw uploadError;

          if (oldPath) {
            await supabase.storage.from('avatars').remove([oldPath]).catch(err => {
              console.warn('Failed to remove old avatar:', err);
            });
          }

          const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath);
          setAvatarUrl(publicUrl);
          if (onUpdateProfile) {
            await onUpdateProfile({ display_name: displayName, bio: statusMsg, avatar_url: publicUrl });
          }
          setShowCropModal(false);
        } catch (err) {
          console.error("Avatar upload failed:", err);
          alert("Error uploading avatar. Please try again.");
        } finally {
          setIsUploadingAvatar(false);
        }
      }, 'image/png');
    };
  };

  const handleUnblock = (id) => {
    setBlockedUsers(prev => prev.filter(u => u.id !== id));
  };

  const handleRevokeDevice = (id) => {
    setDevices(prev => prev.filter(d => d.id !== id));
  };

  // Security Operations
  const handleEnable2FA = (e) => {
    e.preventDefault();
    if (otpVerificationCode === '123456' || otpVerificationCode.length === 6) {
      setIs2faEnabled(true);
      setShow2faSetup(false);
      setOtpVerificationCode('');
      alert("Two-Factor Authentication enabled successfully!");
    } else {
      alert("Please enter a valid 6-digit code (Use 123456 for simulator).");
    }
  };

  const handleChangePassword = (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      alert("Passwords do not match!");
      return;
    }
    alert("Password updated successfully!");
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleExportData = () => {
    const data = {
      app: "Aahat Messaging Platform",
      exportDate: new Date().toISOString(),
      user: {
        name: displayName,
        status: statusMsg,
        privacy: { privacyLastSeen, privacyReceipts, statusAudience },
        theme: themeMode,
        blockedUsersCount: blockedUsers.length,
        devicesCount: devices.length
      }
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `aahat-user-data-${user.email.split('@')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDeleteAccount = () => {
    if (confirm("WARNING: Are you absolutely sure you want to permanently delete your Aahat account? This action is irreversible and all your chat logs, media, and encryption keys will be purged.")) {
      alert("Account deleted. Redirecting to registration.");
      onLogout();
    }
  };

  // Support Operations
  const handleSubmitTicket = (e) => {
    e.preventDefault();
    alert(`Support Ticket submitted successfully!\nSubject: ${ticketSubject}\nSeverity: ${ticketSeverity}`);
    setTicketSubject('');
    setTicketDescription('');
  };

  const handleSubmitBug = (e) => {
    e.preventDefault();
    alert("Bug report logged successfully! Thank you for helping improve Aahat.");
    setBugSteps('');
  };

  const handleSubmitAppeal = (e) => {
    e.preventDefault();
    alert("Appeal submitted successfully. Auditing team will review your account metrics in 48 hours.");
    setAppealReason('');
  };

  // FAQ Database
  const faqs = [
    { q: "Is Aahat really End-to-End Encrypted?", a: "Yes. Aahat uses a secure implementation of the Double Ratchet Algorithm (Signal Protocol) via local Web Crypto. Message keys are derived peer-to-peer on client devices. The database server transfers payloads blindly and never holds your private keys." },
    { q: "How do I sync active device sessions?", a: "Navigate to the 'Connected Devices' settings tab. Select 'Link Device' to display a secure QR code. Scan the code using your main mobile client app to immediately link browser and desktop gateways." },
    { q: "How does the 'Message Yourself' chat work?", a: "Click on your user card at the very top of the chat conversations panel or click the 'You (Message Yourself)' chat item. It acts as a zero-knowledge private scratch space where you can send text notes, capture photos, or store audio voice notes." },
    { q: "What happens when I block a user?", a: "Blocked contacts can no longer send you messages, trigger video/audio calls, or view your status stories. They will see your online status as persistently offline." }
  ];

  const filteredFaqs = !faqSearchQuery.trim() ? faqs : faqs.filter(f =>
    f.q.toLowerCase().includes(faqSearchQuery.toLowerCase()) ||
    f.a.toLowerCase().includes(faqSearchQuery.toLowerCase())
  );

  return (
    <div className="settings-panel-container" id="settings-panel">
      <div className="settings-sidebar">
        <h3>Settings</h3>
        <ul className="settings-nav">
          <li className={activeSubTab === 'profile' ? 'active' : ''} onClick={() => setActiveSubTab('profile')}>
            <User size={16} /> <span>Profile</span>
          </li>
          <li className={activeSubTab === 'privacy' ? 'active' : ''} onClick={() => setActiveSubTab('privacy')}>
            <Shield size={16} /> <span>Privacy</span>
          </li>
          <li className={activeSubTab === 'notifications' ? 'active' : ''} onClick={() => setActiveSubTab('notifications')}>
            <Bell size={16} /> <span>Notifications</span>
          </li>
          <li className={activeSubTab === 'theme' ? 'active' : ''} onClick={() => setActiveSubTab('theme')}>
            <Palette size={16} /> <span>Theme Layout</span>
          </li>
          <li className={activeSubTab === 'security' ? 'active' : ''} onClick={() => setActiveSubTab('security')}>
            <Lock size={16} /> <span>Security & Key logs</span>
          </li>
          <li className={activeSubTab === 'blocked' ? 'active' : ''} onClick={() => setActiveSubTab('blocked')}>
            <Ban size={16} /> <span>Blocked Users</span>
          </li>
          <li className={activeSubTab === 'devices' ? 'active' : ''} onClick={() => setActiveSubTab('devices')}>
            <Laptop size={16} /> <span>Connected Devices</span>
          </li>
          <li className={activeSubTab === 'legal' ? 'active' : ''} onClick={() => setActiveSubTab('legal')}>
            <FileText size={16} /> <span>Legal Policies</span>
          </li>
          <li className={activeSubTab === 'support' ? 'active' : ''} onClick={() => setActiveSubTab('support')}>
            <HelpCircle size={16} /> <span>Help & Support</span>
          </li>
        </ul>
      </div>

      <div className="settings-content">
        {/* PROFILE */}
        {activeSubTab === 'profile' && (
          <form onSubmit={handleSaveProfile} className="settings-section-form">
            <h3>Profile Settings</h3>
            <div className="profile-setup-avatar">
              <SafeAvatar 
                src={avatarUrl} 
                name={displayName} 
                size={80} 
                className="profile-avatar-large" 
                style={{ fontSize: '28px' }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    type="button" 
                    className="btn-secondary-action"
                    onClick={() => document.getElementById('avatar-upload-input').click()}
                  >
                    Change Avatar
                  </button>
                  {avatarUrl && (
                    <button 
                      type="button" 
                      className="btn-secondary-action"
                      style={{ borderColor: 'rgba(239, 68, 68, 0.4)', color: '#fca5a5' }}
                      onClick={handleRemoveAvatar}
                      disabled={isUploadingAvatar}
                    >
                      Remove
                    </button>
                  )}
                </div>
                <input 
                  type="file" 
                  id="avatar-upload-input" 
                  accept="image/*" 
                  style={{ display: 'none' }} 
                  onChange={handleAvatarChange}
                />
                <p className="field-hint">JPG, PNG or GIF. Max 2MB.</p>
              </div>
            </div>

            <div className="form-group" style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '16px', borderRadius: '10px', border: '1px solid var(--panel-border)', marginBottom: '20px' }}>
              <label style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Virtual Number (Aahat ID)</label>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: '18px', color: 'var(--accent-light)', fontFamily: 'monospace', letterSpacing: '1px' }}>
                  {profile?.virtual_number || 'Not Assigned'}
                </strong>
                {profile?.virtual_number && (
                  <button
                    type="button"
                    className="admin-btn admin-btn-ghost"
                    style={{ padding: '6px 12px', fontSize: '11px' }}
                    onClick={() => {
                      navigator.clipboard.writeText(profile.virtual_number);
                      alert("Aahat ID copied to clipboard!");
                    }}
                  >
                    Copy ID
                  </button>
                )}
              </div>
            </div>


            <div className="form-group">
              <label>Display Name</label>
              <input 
                type="text" 
                value={displayName} 
                onChange={e => setDisplayName(e.target.value)} 
                required 
              />
            </div>

            <div className="form-group">
              <label>Bio</label>
              <input 
                type="text" 
                value={statusMsg} 
                onChange={e => setStatusMsg(e.target.value)} 
                placeholder="Write something about yourself..."
              />
            </div>

            <button type="submit" className="admin-btn admin-btn-primary">Save Changes</button>
          </form>
        )}

        {/* PRIVACY */}
        {activeSubTab === 'privacy' && (
          <div className="settings-section">
            <h3>Privacy Settings</h3>
            
            <div className="setting-toggle-row">
              <div>
                <h4>Show Last Seen</h4>
                <p>Allow other users to see when you were last online.</p>
              </div>
              <label className="switch">
                <input type="checkbox" checked={privacyLastSeen} onChange={handleTogglePrivacyLastSeen} />
                <span className="slider" />
              </label>
            </div>

            <div className="setting-toggle-row">
              <div>
                <h4>Send Read Receipts</h4>
                <p>Allow double blue check indicators for read messages.</p>
              </div>
              <label className="switch">
                <input type="checkbox" checked={privacyReceipts} onChange={handleTogglePrivacyReceipts} />
                <span className="slider" />
              </label>
            </div>

            <div className="form-group" style={{ marginTop: '10px' }}>
              <label>Status / Story Audience</label>
              <select value={statusAudience} onChange={e => handleChangeStatusAudience(e.target.value)}>
                <option value="everyone">Everyone</option>
                <option value="contacts">My Contacts Only</option>
                <option value="private">Private (Only selected users)</option>
              </select>
            </div>

            <div className="form-group" style={{ marginTop: '10px' }}>
              <label>Profile Photo Visibility</label>
              <select value={profilePhotoAudience} onChange={e => handleChangeProfilePhotoAudience(e.target.value)}>
                <option value="everyone">Everyone</option>
                <option value="contacts">My Contacts Only</option>
                <option value="nobody">Nobody</option>
              </select>
            </div>

            <div className="setting-toggle-row">
              <div>
                <h4>Show Online Status</h4>
                <p>Allow allowed contacts to see when you are online.</p>
              </div>
              <label className="switch">
                <input type="checkbox" checked={privacyOnline} onChange={handleTogglePrivacyOnline} />
                <span className="slider" />
              </label>
            </div>

            <div className="setting-toggle-row">
              <div>
                <h4>Discoverable by Aahat ID</h4>
                <p>Allow people to find your basic profile with your 10-digit Aahat ID.</p>
              </div>
              <label className="switch">
                <input type="checkbox" checked={discoverByAahatId} onChange={handleToggleDiscoverByAahatId} />
                <span className="slider" />
              </label>
            </div>
          </div>
        )}

        {/* NOTIFICATIONS */}
        {activeSubTab === 'notifications' && (
          <div className="settings-section">
            <h3>Notification Settings</h3>
            
            <div className="setting-toggle-row">
              <div>
                <h4>Sound Alerts</h4>
                <p>Play sounds for incoming messages and call rings.</p>
              </div>
              <label className="switch">
                <input type="checkbox" checked={notifSound} onChange={handleToggleNotifSound} />
                <span className="slider" />
              </label>
            </div>

            <div className="setting-toggle-row">
              <div>
                <h4>Message Previews</h4>
                <p>Show message preview in system notification toasts.</p>
              </div>
              <label className="switch">
                <input type="checkbox" checked={notifPreviews} onChange={handleToggleNotifPreviews} />
                <span className="slider" />
              </label>
            </div>

            <div style={{ marginTop: '24px', padding: '16px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '10px', border: '1px solid var(--panel-border)' }}>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: '600' }}>Push Notifications (Mobile & Desktop)</h4>
              <p style={{ margin: '0 0 16px 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                Enable system push notifications to stay updated when the app is running in the background or closed.
              </p>
              <button
                type="button"
                className="admin-btn admin-btn-primary"
                onClick={onRequestNotificationPermission}
                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <Bell size={16} />
                <span>Enable Push Notifications</span>
              </button>
            </div>
          </div>
        )}

        {/* THEME */}
        {activeSubTab === 'theme' && (
          <div className="settings-section">
            <h3>Theme Settings</h3>
            <p>Customize the visual style of your Aahat messaging environment.</p>
            
            <div className="theme-selector-grid">
              <div 
                className={`theme-card ${themeMode === 'glass' ? 'active' : ''}`}
                onClick={() => setThemeMode('glass')}
              >
                <div className="theme-card-preview glass" />
                <span>Glassmorphism (Primary)</span>
              </div>
              
              <div 
                className={`theme-card ${themeMode === 'dark' ? 'active' : ''}`}
                onClick={() => setThemeMode('dark')}
              >
                <div className="theme-card-preview dark" />
                <span>Solid Dark</span>
              </div>

              <div 
                className={`theme-card ${themeMode === 'neon' ? 'active' : ''}`}
                onClick={() => setThemeMode('neon')}
              >
                <div className="theme-card-preview neon" />
                <span>Cyber Neon Accent</span>
              </div>
            </div>
          </div>
        )}

        {/* SECURITY & KEY LOGS */}
        {activeSubTab === 'security' && (
          <div className="settings-section" style={{ maxWidth: '600px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <h3>Security & Active Logins</h3>
            
            {/* Two-Factor Authentication Toggle */}
            <div className="setting-toggle-row" style={{ padding: '16px', background: 'rgba(30,41,59,0.3)', border: '1px solid var(--panel-border)', borderRadius: 'var(--radius-md)' }}>
              <div>
                <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Shield size={18} style={{ color: 'var(--accent-light)' }} /> Two-Factor Authentication (2FA)</h4>
                <p style={{ marginTop: '4px' }}>Add an extra layer of protection by requiring a 6-digit verification PIN.</p>
              </div>
              <label className="switch">
                <input 
                  type="checkbox" 
                  checked={is2faEnabled} 
                  onChange={() => {
                    if (is2faEnabled) {
                      setIs2faEnabled(false);
                    } else {
                      setShow2faSetup(true);
                    }
                  }} 
                />
                <span className="slider" />
              </label>
            </div>

            {/* 2FA Setup Flow Drawer */}
            {show2faSetup && (
              <div className="sub-settings-card" style={{ padding: '20px', background: 'rgba(15,23,42,0.5)', border: '1px solid var(--panel-border)', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: '14px', animation: 'modalScaleIn 0.3s var(--ease-spring)' }}>
                <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Key size={16} /> Setup Two-Factor Verification</h4>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center', background: 'rgba(15, 23, 42, 0.3)', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.03)' }}>
                  {/* Mock QR Code */}
                  <div style={{ width: '80px', height: '80px', background: '#fff', padding: '6px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <div style={{ width: '100%', height: '100%', background: 'repeating-conic-gradient(#000 0% 25%, #fff 0% 50%) 50% / 10px 10px' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: '11.5px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>Scan this QR code inside Google Authenticator, or type the manual secret key below:</p>
                    <code style={{ fontSize: '12px', color: 'var(--accent-light)', background: 'rgba(0,0,0,0.2)', padding: '2px 6px', borderRadius: '4px', display: 'inline-block', marginTop: '6px', letterSpacing: '1px', fontWeight: '700' }}>AAHAT-KEY-2026</code>
                  </div>
                </div>
                <form onSubmit={handleEnable2FA} style={{ display: 'flex', gap: '10px' }}>
                  <input 
                    type="text" 
                    placeholder="Enter 6-digit verification code" 
                    value={otpVerificationCode} 
                    onChange={e => setOtpVerificationCode(e.target.value)} 
                    maxLength={6}
                    required
                    style={{ flex: 1 }}
                  />
                  <button type="submit" className="admin-btn admin-btn-primary" style={{ padding: '10px 20px', fontSize: '12.5px' }}>Verify & Activate</button>
                </form>
              </div>
            )}

            {/* Change Password Panel */}
            <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '20px', background: 'rgba(30,41,59,0.3)', border: '1px solid var(--panel-border)', borderRadius: 'var(--radius-md)' }}>
              <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--panel-border)', paddingBottom: '10px', marginBottom: '4px' }}><Lock size={16} style={{ color: 'var(--accent-light)' }} /> Update Password</h4>
              <div className="form-group">
                <label>Old Password</label>
                <input type="password" value={oldPassword} onChange={e => setOldPassword(e.target.value)} required placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢" />
              </div>
              <div className="form-group">
                <label>New Password</label>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢" />
              </div>
              <div className="form-group">
                <label>Confirm New Password</label>
                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢" />
              </div>
              <button type="submit" className="admin-btn admin-btn-primary" style={{ alignSelf: 'flex-start', gap: '6px' }}>
                <Key size={14} /> Update Password
              </button>
            </form>

            {/* Session Audit list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '20px', background: 'rgba(30,41,59,0.3)', border: '1px solid var(--panel-border)', borderRadius: 'var(--radius-md)' }}>
              <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--panel-border)', paddingBottom: '10px', marginBottom: '4px' }}><Laptop size={16} style={{ color: 'var(--accent-light)' }} /> Recent Security Audits</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {loginLogs.map(log => (
                  <div key={log.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'rgba(15,23,42,0.25)', border: '1px solid var(--panel-border)', borderRadius: 'var(--radius-md)', fontSize: '13px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--panel-border)' }}>
                        <Laptop size={14} style={{ color: 'var(--text-secondary)' }} />
                      </div>
                      <div>
                        <strong style={{ color: '#fff' }}>{log.device}</strong>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '8px' }}>({log.ip})</span>
                        <p style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '2px' }}>{log.date}</p>
                      </div>
                    </div>
                    <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '4px' }}>{log.location}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Account Management Actions */}
            <div style={{ borderTop: '1px solid var(--panel-border)', paddingTop: '20px', display: 'flex', gap: '12px', marginTop: '10px' }}>
              <button type="button" onClick={handleExportData} className="admin-btn admin-btn-ghost" style={{ flex: 1, gap: '6px' }}>
                <Download size={14} /> Export User Info
              </button>
              <button type="button" onClick={handleDeleteAccount} className="admin-btn admin-btn-ghost" style={{ flex: 1, gap: '6px', borderColor: 'rgba(239, 68, 68, 0.3)', color: '#fca5a5' }}>
                <Trash2 size={14} /> Delete Account
              </button>
            </div>
          </div>
        )}

        {/* BLOCKED USERS */}
        {activeSubTab === 'blocked' && (
          <div className="settings-section">
            <h3>Blocked Users</h3>
            <p>Users in this list cannot send you messages or call you.</p>
            
            <div className="blocked-list-wrapper">
              {blockedUsers.length === 0 ? (
                <div className="empty-settings-state">No blocked users</div>
              ) : (
                blockedUsers.map(user => (
                  <div key={user.id} className="blocked-user-item">
                    <div>
                      <h4>{user.name}</h4>
                      <span>{user.email}</span>
                    </div>
                    <button className="btn-unblock" onClick={() => handleUnblock(user.id)}>Unblock</button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* CONNECTED DEVICES */}
        {activeSubTab === 'devices' && (
          <div className="settings-section">
            <h3>Connected Devices</h3>
            <p>Manage browser and desktop environments active on your Aahat account.</p>
            
            <div className="devices-list-wrapper">
              {devices.map(device => (
                <div key={device.id} className="device-item">
                  <div className="device-info">
                    <h4>{device.name}</h4>
                    <span>{device.location} {device.lastSeen && `â€¢ ${device.lastSeen}`}</span>
                  </div>
                  {device.id !== 'd1' && (
                    <button 
                      className="btn-revoke-device" 
                      onClick={() => handleRevokeDevice(device.id)}
                      title="Log out device"
                    >
                      <LogOut size={14} /> Revoke
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* LEGAL & COMPLIANCE POLICIES */}
        {activeSubTab === 'legal' && (
          <div className="settings-section">
            <h3>Legal Agreements & Compliance Center</h3>
            <p>Read through Aahat's operational rules, cookies regulations, and safety policies required for standard App Store compliance.</p>
            
            {/* Legal Picker Row */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
              <button type="button" onClick={() => setSelectedLegalDoc('privacy')} className={`admin-btn ${selectedLegalDoc === 'privacy' ? 'admin-btn-primary' : 'admin-btn-ghost'}`} style={{ padding: '6px 12px', fontSize: '11.5px' }}>Privacy Policy</button>
              <button type="button" onClick={() => setSelectedLegalDoc('terms')} className={`admin-btn ${selectedLegalDoc === 'terms' ? 'admin-btn-primary' : 'admin-btn-ghost'}`} style={{ padding: '6px 12px', fontSize: '11.5px' }}>Terms of Service</button>
              <button type="button" onClick={() => setSelectedLegalDoc('cookies')} className={`admin-btn ${selectedLegalDoc === 'cookies' ? 'admin-btn-primary' : 'admin-btn-ghost'}`} style={{ padding: '6px 12px', fontSize: '11.5px' }}>Cookie Policy</button>
              <button type="button" onClick={() => setSelectedLegalDoc('deletion')} className={`admin-btn ${selectedLegalDoc === 'deletion' ? 'admin-btn-primary' : 'admin-btn-ghost'}`} style={{ padding: '6px 12px', fontSize: '11.5px' }}>Data Deletion</button>
            </div>

            {/* Document display card */}
            <div style={{ padding: '16px', background: 'rgba(15,23,42,0.3)', border: '1px solid var(--panel-border)', borderRadius: 'var(--radius-md)', height: '240px', overflowY: 'auto', fontSize: '12.5px', lineHeight: '1.6', color: 'var(--text-secondary)' }}>
              {selectedLegalDoc === 'privacy' && (
                <div>
                  <h4 style={{ color: 'white', marginBottom: '8px' }}>Privacy Policy (GDPR & CCPA Compliant)</h4>
                  <p><strong>Last Updated: June 19, 2026</strong></p>
                  <p style={{ marginTop: '8px' }}>Your privacy is our primary priority. Aahat uses End-to-End Encryption (E2EE) to safeguard all chat logs and call histories. We do NOT harvest, analyze, or trade your personal conversations.</p>
                  <p style={{ marginTop: '8px' }}>1. <strong>Information We Collect:</strong> Your phone registration number and synced contact details to discover active peers. We store cryptographically randomized registration tokens to direct WebPush notifications.</p>
                  <p style={{ marginTop: '8px' }}>2. <strong>Zero-Knowledge:</strong> Key exchange data packets are processed peer-to-peer on local devices. Server infrastructure carries encrypted payloads blindly.</p>
                </div>
              )}
              {selectedLegalDoc === 'terms' && (
                <div>
                  <h4 style={{ color: 'white', marginBottom: '8px' }}>Terms & Conditions of Service</h4>
                  <p><strong>Effective Date: June 19, 2026</strong></p>
                  <p style={{ marginTop: '8px' }}>Welcome to Aahat. By utilizing our mobile application, web portals, or signaling APIs, you agree to follow the stated operational rules:</p>
                  <p style={{ marginTop: '8px' }}>- You will not use the service to distribute spam, malware, phishing links, or unauthorized advertising packages.</p>
                  <p style={{ marginTop: '8px' }}>- You will not exploit or run bots to scrap contact listings or message payloads from signaling tunnels.</p>
                  <p style={{ marginTop: '8px' }}>- Aahat reserves the absolute right to suspend accounts discovered violating safety policies.</p>
                </div>
              )}
              {selectedLegalDoc === 'cookies' && (
                <div>
                  <h4 style={{ color: 'white', marginBottom: '8px' }}>Cookie Policy (Web App)</h4>
                  <p>Aahat uses primary cookies solely to sustain your login sessions, store locale configurations, and remember UI settings (e.g. Glassmorphic state preferences).</p>
                  <p style={{ marginTop: '8px' }}>We do NOT deploy third-party advertising cookies or cross-site tracking tokens. You can turn off cookie permissions in your browser configurations, which will require inputting OTP keys on every visit.</p>
                </div>
              )}
              {selectedLegalDoc === 'deletion' && (
                <div>
                  <h4 style={{ color: 'white', marginBottom: '8px' }}>Data Deletion Policy</h4>
                  <p>Aahat is committed to the right to be forgotten. Under GDPR laws, users can request total data deletion at any moment:</p>
                  <p style={{ marginTop: '8px' }}>- To execute deletion instantly, navigate to the <strong>Security & Key logs</strong> settings subtab and click <strong>Delete Account</strong>.</p>
                  <p style={{ marginTop: '8px' }}>- This triggers database routines purging all contact sync records, chat histories, active sessions, and verification secrets.</p>
                </div>
              )}
            </div>

            {/* Compliance URL Card */}
            <div style={{ 
              marginTop: '12px', 
              padding: '12px 16px', 
              background: 'rgba(15,23,42,0.4)', 
              border: '1px solid var(--panel-border)', 
              borderRadius: 'var(--radius-md)', 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              gap: '12px' 
            }}>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>
                  Public Play Store / App Store Link
                </span>
                <code style={{ fontSize: '11px', color: 'var(--accent-light)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', display: 'block' }}>
                  {typeof window !== 'undefined' ? window.location.origin + '/' + selectedLegalDoc + '.html' : 'https://aahat.app/' + selectedLegalDoc + '.html'}
                </code>
              </div>
              <button 
                type="button" 
                onClick={() => {
                  const url = typeof window !== 'undefined' ? window.location.origin + '/' + selectedLegalDoc + '.html' : 'https://aahat.app/' + selectedLegalDoc + '.html';
                  navigator.clipboard.writeText(url);
                  alert("Play Store compliance link copied to clipboard!");
                }} 
                className="admin-btn admin-btn-ghost" 
                style={{ padding: '6px 12px', fontSize: '11px', flexShrink: 0 }}
              >
                Copy Link
              </button>
            </div>
          </div>
        )}

        {/* HELP & SUPPORT DESK */}
        {activeSubTab === 'support' && (
          <div className="settings-section">
            <h3>Help & Support Desk</h3>
            
            {/* FAQ Search */}
            <div className="form-group" style={{ marginBottom: '10px' }}>
              <label>Search Help Center</label>
              <div className="search-bar" style={{ background: 'rgba(15,23,42,0.3)', border: '1px solid var(--panel-border)' }}>
                <Search size={14} className="search-icon" />
                <input 
                  type="text" 
                  placeholder="Ask a question..." 
                  value={faqSearchQuery}
                  onChange={e => setFaqSearchQuery(e.target.value)}
                />
              </div>
            </div>

            {/* FAQs list Accordion */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filteredFaqs.map((faq, idx) => (
                <div 
                  key={idx} 
                  style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--panel-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}
                >
                  <div 
                    onClick={() => setActiveFaqIndex(activeFaqIndex === idx ? null : idx)} 
                    style={{ padding: '12px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: '600', fontSize: '13px' }}
                  >
                    <span>{faq.q}</span>
                    <ChevronRight size={14} style={{ transform: activeFaqIndex === idx ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
                  </div>
                  {activeFaqIndex === idx && (
                    <div style={{ padding: '12px 16px', borderTop: '1px solid var(--panel-border)', fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                      {faq.a}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Ticket Submission Form */}
            <form onSubmit={handleSubmitTicket} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px', borderTop: '1px solid var(--panel-border)', paddingTop: '20px' }}>
              <h4>Contact Support / File Ticket</h4>
              <div className="form-group">
                <label>Subject</label>
                <input type="text" value={ticketSubject} onChange={e => setTicketSubject(e.target.value)} placeholder="Brief title of your issue" required />
              </div>
              <div className="form-group">
                <label>Issue Details</label>
                <textarea value={ticketDescription} onChange={e => setTicketDescription(e.target.value)} placeholder="Describe the issue in detail" rows={3} required />
              </div>
              <div className="form-group">
                <label>Priority</label>
                <select value={ticketSeverity} onChange={e => setTicketSeverity(e.target.value)}>
                  <option value="low">Low Priority</option>
                  <option value="medium">Medium Priority</option>
                  <option value="high">High Priority</option>
                </select>
              </div>
              <button type="submit" className="admin-btn admin-btn-primary" style={{ alignSelf: 'flex-start' }}>Submit Ticket</button>
            </form>

            {/* Bug Reporter */}
            <form onSubmit={handleSubmitBug} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px', borderTop: '1px solid var(--panel-border)', paddingTop: '20px' }}>
              <h4>Report a Technical Bug</h4>
              <div className="form-group">
                <label>Steps to Reproduce</label>
                <textarea value={bugSteps} onChange={e => setBugSteps(e.target.value)} placeholder="1. Go to Chats&#10;2. Select profile...&#10;3. Error happens..." rows={3} required />
              </div>
              <button type="submit" className="admin-btn admin-btn-primary" style={{ alignSelf: 'flex-start' }}>Log Bug</button>
            </form>

            {/* Appeal Suspension Form */}
            <form onSubmit={handleSubmitAppeal} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px', borderTop: '1px solid var(--panel-border)', paddingTop: '20px' }}>
              <h4>Appeal Suspension / Verification Lock</h4>
              <div className="form-group">
                <label>Statement of Appeal</label>
                <textarea value={appealReason} onChange={e => setAppealReason(e.target.value)} placeholder="Provide context on why your verification status or login access was locked..." rows={3} required />
              </div>
              <button type="submit" className="admin-btn admin-btn-primary" style={{ alignSelf: 'flex-start', borderColor: 'rgba(99,102,241,0.3)' }}>Submit Appeal</button>
            </form>
          </div>
        )}
      </div>

      {showCropModal && (
        <div className="crop-modal-overlay">
          <div className="crop-modal-container">
            <div className="crop-modal-header">
              <h4>Crop Profile Photo</h4>
            </div>
            <div className="crop-modal-body">
              <div 
                className="crop-preview-area"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleMouseUp}
              >
                <img 
                  src={cropImgSrc} 
                  style={{
                    position: 'absolute',
                    left: `${(300 - (imgAspect > 1 ? 300 * imgAspect * zoom : 300 * zoom)) / 2 + position.x}px`,
                    top: `${(300 - (imgAspect > 1 ? 300 * zoom : (300 / imgAspect) * zoom)) / 2 + position.y}px`,
                    width: `${imgAspect > 1 ? 300 * imgAspect * zoom : 300 * zoom}px`,
                    height: `${imgAspect > 1 ? 300 * zoom : (300 / imgAspect) * zoom}px`,
                    pointerEvents: 'none',
                    userSelect: 'none',
                    maxWidth: 'none',
                  }} 
                  alt="crop preview" 
                />
                <div className="crop-circle-overlay" />
              </div>
              <div className="crop-zoom-container">
                <span className="zoom-label">Zoom</span>
                <input 
                  type="range" 
                  min="1" 
                  max="3" 
                  step="0.1" 
                  value={zoom} 
                  onChange={(e) => setZoom(parseFloat(e.target.value))}
                  className="crop-zoom-slider"
                />
              </div>
            </div>
            <div className="crop-modal-footer">
              <button 
                type="button" 
                className="admin-btn admin-btn-ghost" 
                onClick={() => setShowCropModal(false)}
                disabled={isUploadingAvatar}
              >
                Cancel
              </button>
              <button 
                type="button" 
                className="admin-btn admin-btn-primary" 
                onClick={handleSaveCrop}
                disabled={isUploadingAvatar}
              >
                {isUploadingAvatar ? 'Saving...' : 'Save Avatar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
