import React, { useState, useEffect, useMemo } from 'react';
import { Camera, X, Play, Eye, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import SafeAvatar from './SafeAvatar';

/**
 * StatusSection - Renders story circles and a fullscreen premium story viewer
 * with slide progress bars, text/image slide controls, and view counters.
 */
export default function StatusSection({ contacts, user, onSelectContact, onUploadFile, onPostStory }) {
  const [activeStoryContact, setActiveStoryContact] = useState(null);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [showAddStoryModal, setShowAddStoryModal] = useState(false);
  const [newTextStory, setNewTextStory] = useState('');
  const [newBgGradient, setNewBgGradient] = useState('linear-gradient(135deg, #6366f1 0%, #a855f7 100%)');
  
  // Custom video story composition states
  const [storyType, setStoryType] = useState('text'); // text, video
  const [videoFile, setVideoFile] = useState(null);
  const [videoDuration, setVideoDuration] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  const myStories = useMemo(() => {
    return contacts.find(c => c.id === 'me')?.stories || [];
  }, [contacts]);

  // Filter contacts who have stories (excluding current user)
  const contactsWithStories = useMemo(() => {
    return contacts.filter(c => 
      c.stories && c.stories.length > 0 && 
      !(user && (c.name.toLowerCase() === user.name.toLowerCase() || c.id === 'me' || c.id === user.email?.split('@')[0]))
    );
  }, [contacts, user]);

  // Active friends to display in the Active Now strip (excluding current user)
  const activeFriends = useMemo(() => {
    return contacts.filter(c => 
      c.isActive && !c.isGroup && 
      !(user && (c.name.toLowerCase() === user.name.toLowerCase() || c.id === 'me' || c.id === user.email?.split('@')[0]))
    );
  }, [contacts, user]);

  // Auto-progress stories
  useEffect(() => {
    if (!activeStoryContact) return;

    setProgress(0);
    const storiesList = activeStoryContact.id === 'me' ? myStories : activeStoryContact.stories;
    const currentStory = storiesList[currentSlideIndex];

    const duration = 5000; // 5 seconds per story slide
    const intervalTime = 50;
    const steps = duration / intervalTime;
    let currentStep = 0;

    const timer = setInterval(() => {
      currentStep++;
      const nextProgress = (currentStep / steps) * 100;
      setProgress(nextProgress);

      if (currentStep >= steps) {
        clearInterval(timer);
        handleNextSlide(storiesList);
      }
    }, intervalTime);

    return () => clearInterval(timer);
  }, [activeStoryContact, currentSlideIndex, myStories]);

  const handleNextSlide = (storiesList) => {
    if (currentSlideIndex < storiesList.length - 1) {
      setCurrentSlideIndex(prev => prev + 1);
    } else {
      // Close viewer
      setActiveStoryContact(null);
    }
  };

  const handlePrevSlide = () => {
    if (currentSlideIndex > 0) {
      setCurrentSlideIndex(prev => prev - 1);
    }
  };

  const openStoryViewer = (contact) => {
    setActiveStoryContact(contact);
    setCurrentSlideIndex(0);
    setProgress(0);
  };

  const handleVideoFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Check size limit: 10MB
    const MAX_SIZE_MB = 10;
    const maxSizeBytes = MAX_SIZE_MB * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      alert(`File size exceeds ${MAX_SIZE_MB}MB limit! Please select a smaller video.`);
      e.target.value = null;
      setVideoFile(null);
      setVideoDuration(null);
      return;
    }

    // Check duration limit: 60s
    const videoElement = document.createElement('video');
    videoElement.preload = 'metadata';
    videoElement.src = URL.createObjectURL(file);
    videoElement.onloadedmetadata = () => {
      URL.revokeObjectURL(videoElement.src);
      const duration = videoElement.duration;
      if (duration > 60) {
        alert("Video duration exceeds 60 seconds! Please select a shorter video.");
        e.target.value = null;
        setVideoFile(null);
        setVideoDuration(null);
      } else {
        setVideoFile(file);
        setVideoDuration(duration);
      }
    };
  };

  const handleAddStory = async (e) => {
    e.preventDefault();
    
    if (storyType === 'text') {
      if (!newTextStory.trim()) return;

      if (onPostStory) {
        await onPostStory('text', newTextStory, newBgGradient);
      }
      setNewTextStory('');
      setShowAddStoryModal(false);
    } else {
      if (!videoFile) {
        alert("Please select a video file first.");
        return;
      }

      setIsUploading(true);
      try {
        const videoUrl = await onUploadFile(videoFile);
        if (onPostStory) {
          await onPostStory('video', videoUrl);
        }
        setVideoFile(null);
        setVideoDuration(null);
        setShowAddStoryModal(false);
      } catch (err) {
        console.error("Video story upload failed:", err);
        alert("Failed to upload video story. Please try again.");
      } finally {
        setIsUploading(false);
      }
    }
  };

  const gradients = [
    'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
    'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
    'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    'linear-gradient(135deg, #ec4899 0%, #f43f5e 100%)',
    'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
  ];

  return (
    <div className="status-section-container" id="status-section">
      <div className="status-header">
        <h2>Stories</h2>
        <button className="btn-add-story" onClick={() => setShowAddStoryModal(true)} id="btn-create-story">
          <Plus size={16} /> Add Story
        </button>
      </div>

      <div className="stories-tray">
        {/* User Story Circle */}
        <div className="story-circle-item me" onClick={() => myStories.length > 0 && openStoryViewer({ id: 'me', name: 'My Status', avatarUrl: user.avatarUrl })}>
          <div className={`story-ring ${myStories.length > 0 ? 'active' : ''}`}>
            <SafeAvatar 
              src={user.avatarUrl} 
              name={user.name} 
              size={50} 
              className="user-story-avatar" 
            />
            <button className="add-story-badge" onClick={(e) => { e.stopPropagation(); setShowAddStoryModal(true); }}>
              <Plus size={12} />
            </button>
          </div>
          <span>My Status</span>
        </div>

        {/* Contacts Story Circles */}
        {contactsWithStories.map(contact => (
          <div key={contact.id} className="story-circle-item" onClick={() => openStoryViewer(contact)}>
            <div className="story-ring active">
              <SafeAvatar 
                src={contact.avatarUrl} 
                name={contact.name} 
                size={50} 
                className="story-avatar-img" 
              />
            </div>
            <span>{contact.name.split(' ')[0]}</span>
          </div>
        ))}
      </div>

      {/* Active Now Section */}
      {activeFriends.length > 0 && (
        <div className="active-friends-section" style={{ marginTop: '20px', borderTop: '1px solid var(--panel-border)', borderBottom: 'none', paddingTop: '20px' }}>
          <div className="section-label" style={{ paddingLeft: '0' }}>
            Active Now
            <span className="active-count">{activeFriends.length}</span>
          </div>
          <div className="active-friends-list" style={{ paddingLeft: '0', paddingRight: '0' }}>
            {activeFriends.map(friend => (
              <div
                key={friend.id}
                className="active-friend-item"
                onClick={() => onSelectContact?.(friend.id)}
                id={`active-friend-${friend.id}`}
              >
                <div className="avatar-wrapper">
                  <SafeAvatar 
                    src={friend.avatarUrl} 
                    name={friend.name} 
                    size={44} 
                    className="avatar-image" 
                  />
                  <div className="status-badge active" />
                </div>
                <span className="active-friend-name">{friend.name.split(' ')[0]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Story Viewer Modal */}
      {activeStoryContact && (() => {
        const storiesList = activeStoryContact.id === 'me' ? myStories : activeStoryContact.stories;
        const currentStory = storiesList[currentSlideIndex];
        if (!currentStory) return null;

        return (
          <div className="story-viewer-overlay" onClick={() => setActiveStoryContact(null)}>
            <div className="story-viewer-card" onClick={e => e.stopPropagation()}>
              
              {/* Progress Bars */}
              <div className="story-progress-container">
                {storiesList.map((story, index) => (
                  <div key={story.id} className="story-progress-bar-bg">
                    <div 
                      className="story-progress-bar-fill" 
                      style={{ 
                        width: index < currentSlideIndex 
                          ? '100%' 
                          : index === currentSlideIndex 
                            ? `${progress}%` 
                            : '0%' 
                      }} 
                    />
                  </div>
                ))}
              </div>

              {/* Header */}
              <div className="story-viewer-header">
                <div className="story-viewer-user">
                  <SafeAvatar 
                    src={activeStoryContact.id === 'me' ? user.avatarUrl : activeStoryContact.avatarUrl} 
                    name={activeStoryContact.id === 'me' ? user.name : activeStoryContact.name} 
                    size={36} 
                    className="story-user-avatar" 
                  />
                  <div>
                    <h4>{activeStoryContact.id === 'me' ? 'My Status' : activeStoryContact.name}</h4>
                    <span className="story-time">
                      {new Date(currentStory.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
                <button className="story-close-btn" onClick={() => setActiveStoryContact(null)}>
                  <X size={20} />
                </button>
              </div>

              {/* Body */}
              <div className="story-viewer-body">
                {currentStory.type === 'text' ? (
                  <div className="story-text-slide" style={{ background: currentStory.bgGradient }}>
                    <p>{currentStory.content}</p>
                  </div>
                ) : currentStory.type === 'video' ? (
                  <div className="story-image-slide" style={{ background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <video 
                      src={currentStory.url} 
                      autoPlay 
                      controls={false}
                      muted 
                      playsInline 
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    />
                  </div>
                ) : (
                  <div className="story-image-slide">
                    <img src={currentStory.url} alt="Story content" />
                  </div>
                )}

                {/* Left/Right click regions */}
                <div className="story-nav-btn left" onClick={handlePrevSlide} disabled={currentSlideIndex === 0}>
                  <ChevronLeft size={24} />
                </div>
                <div className="story-nav-btn right" onClick={() => handleNextSlide(storiesList)}>
                  <ChevronRight size={24} />
                </div>
              </div>

              {/* Footer View Counter */}
              <div className="story-viewer-footer">
                <span className="views-count">
                  <Eye size={14} /> {currentStory.views} views
                </span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Add Story Modal */}
      {showAddStoryModal && (
        <div className="modal-overlay" onClick={() => setShowAddStoryModal(false)}>
          <div className="modal-card story-compose-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Create a Status Story</h3>
              <button className="modal-close" onClick={() => setShowAddStoryModal(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleAddStory}>
              {/* Tab Switcher */}
              <div className="story-type-tabs" style={{ display: 'flex', gap: '10px', marginBottom: '16px', borderBottom: '1px solid var(--panel-border)', paddingBottom: '10px' }}>
                <button 
                  type="button" 
                  className={`admin-btn ${storyType === 'text' ? 'admin-btn-primary' : 'admin-btn-ghost'}`} 
                  onClick={() => setStoryType('text')}
                  style={{ flex: 1, padding: '8px', fontSize: '12px' }}
                >
                  Text Status
                </button>
                <button 
                  type="button" 
                  className={`admin-btn ${storyType === 'video' ? 'admin-btn-primary' : 'admin-btn-ghost'}`} 
                  onClick={() => setStoryType('video')}
                  style={{ flex: 1, padding: '8px', fontSize: '12px' }}
                >
                  Video Status
                </button>
              </div>

              {storyType === 'text' ? (
                <>
                  <div className="form-group">
                    <label>What's on your mind?</label>
                    <textarea 
                      placeholder="Type your story status..." 
                      maxLength={150} 
                      required
                      value={newTextStory}
                      onChange={e => setNewTextStory(e.target.value)}
                      className="story-textarea"
                    />
                  </div>

                  <div className="form-group">
                    <label>Choose Background Color</label>
                    <div className="gradient-palette">
                      {gradients.map(grad => (
                        <div 
                          key={grad} 
                          className={`gradient-color-circle ${newBgGradient === grad ? 'selected' : ''}`}
                          style={{ background: grad }}
                          onClick={() => setNewBgGradient(grad)}
                        />
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label>Choose Video from Device</label>
                  <div 
                    className="video-upload-area" 
                    style={{ 
                      border: '2px dashed var(--panel-border)', 
                      borderRadius: 'var(--radius-md)', 
                      padding: '30px 20px', 
                      textAlign: 'center', 
                      cursor: 'pointer', 
                      background: 'rgba(255,255,255,0.01)', 
                      transition: 'border-color 0.2s',
                      marginTop: '8px'
                    }} 
                    onClick={() => document.getElementById('story-video-input').click()}
                  >
                    <input 
                      type="file" 
                      id="story-video-input" 
                      accept="video/*" 
                      style={{ display: 'none' }} 
                      onChange={handleVideoFileChange}
                    />
                    {videoFile ? (
                      <div>
                        <p style={{ color: 'var(--accent-light)', fontWeight: '600', fontSize: '13px', margin: 0 }}>✓ {videoFile.name}</p>
                        <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '6px', margin: '6px 0 0 0' }}>Size: {(videoFile.size / (1024 * 1024)).toFixed(2)} MB</p>
                        {videoDuration && <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>Duration: {videoDuration.toFixed(1)} seconds</p>}
                      </div>
                    ) : (
                      <div>
                        <Play size={24} style={{ color: 'var(--text-secondary)', margin: '0 auto 8px', opacity: 0.7, display: 'block' }} />
                        <p style={{ fontSize: '13px', fontWeight: '500', margin: 0 }}>Select Video File</p>
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', margin: '4px 0 0 0' }}>Max 60 seconds • Max 10MB</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="form-actions">
                <button type="button" className="admin-btn admin-btn-ghost" onClick={() => setShowAddStoryModal(false)} disabled={isUploading}>Cancel</button>
                <button type="submit" className="admin-btn admin-btn-primary" disabled={isUploading}>
                  {isUploading ? "Uploading..." : "Post Story"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
