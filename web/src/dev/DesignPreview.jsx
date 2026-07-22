import { useState } from 'react';
import Sidebar from '../components/Sidebar';
import ChatView from '../components/ChatView';
import ContactsSection from '../components/ContactsSection';
import PrivacySettingsSection from '../components/PrivacySettingsSection';
import AppPreferencesSection from '../components/AppPreferencesSection';
import * as fixtures from './designFixtures';

/**
 * Design preview harness — dev only.
 *
 * Renders the REAL screen components against fixture data so they can be seen
 * and measured at every breakpoint without a Supabase session. This exists
 * because the design audit could otherwise only reach the login screen.
 *
 * Reached at /?preview=<screen>. Guarded by import.meta.env.DEV in main.jsx,
 * so it is dead code in a production build.
 */

const SCREENS = ['chats', 'chat', 'contacts', 'privacy', 'preferences'];

export default function DesignPreview({ screen }) {
  const [privacy, setPrivacy] = useState(fixtures.privacyDefaults);
  const active = SCREENS.includes(screen) ? screen : 'chats';

  // Presence helpers the real components expect from hooks.
  const isUserOnline = id => id === fixtures.activeConversation.otherMemberId;
  const canViewOnlineStatus = () => true;
  const getLastSeen = () => new Date(Date.now() - 45 * 60_000).toISOString();

  return (
    <div className="app-container" id="app-container" data-design-preview={active}>
      {active === 'chats' && (
        <Sidebar
          conversations={fixtures.conversations}
          selectedConversationId={null}
          onSelectConversation={fixtures.noop}
          isMobileOpen
          toggleArchive={fixtures.asyncNoop}
          togglePin={fixtures.asyncNoop}
          toggleMute={fixtures.asyncNoop}
          toggleFavorite={fixtures.asyncNoop}
          onNewChat={fixtures.noop}
          isUserOnline={isUserOnline}
          canViewOnlineStatus={canViewOnlineStatus}
          isLoading={false}
        />
      )}

      {active === 'chat' && (
        <ChatView
          conversation={fixtures.activeConversation}
          messages={fixtures.messages}
          typingUsers={[]}
          onSend={fixtures.asyncNoop}
          onAddReaction={fixtures.asyncNoop}
          onDeleteForMe={fixtures.asyncNoop}
          onDeleteForEveryone={fixtures.asyncNoop}
          onEditMessage={fixtures.asyncNoop}
          onRetryMessage={fixtures.asyncNoop}
          onLoadMoreMessages={fixtures.asyncNoop}
          hasMoreMessages={false}
          isLoadingMoreMessages={false}
          onUploadFile={fixtures.asyncNoop}
          onSearchMessages={fixtures.asyncNoop}
          onFetchSharedMedia={async () => []}
          onConsumeAttachment={fixtures.asyncNoop}
          onResolveAttachmentUrl={fixtures.asyncNoop}
          timeFormatRevision={0}
          onStartCall={fixtures.noop}
          conversations={fixtures.conversations}
          onClearChat={fixtures.asyncNoop}
          onDeleteChat={fixtures.asyncNoop}
          onToggleArchive={fixtures.asyncNoop}
          onToggleMute={fixtures.asyncNoop}
          onSetTyping={fixtures.noop}
          currentUserId={fixtures.CURRENT_USER_ID}
          isUserOnline={isUserOnline}
          canViewOnlineStatus={canViewOnlineStatus}
          getLastSeen={getLastSeen}
          onForwardMessage={fixtures.asyncNoop}
          onFetchGroupMembers={async () => []}
        />
      )}

      {active === 'contacts' && (
        <ContactsSection
          conversations={fixtures.conversations}
          incomingRequests={fixtures.contactRequests}
          outgoingRequests={[]}
          isLoading={false}
          isUserOnline={isUserOnline}
          canViewOnlineStatus={canViewOnlineStatus}
          onAddContact={fixtures.noop}
          onSelectConversation={fixtures.noop}
          onRespond={fixtures.asyncNoop}
          onRemoveContact={fixtures.asyncNoop}
          onBlockContact={fixtures.asyncNoop}
        />
      )}

      {(active === 'privacy' || active === 'preferences') && (
        <div className="settings-panel">
          <main className="settings-content">
            {active === 'privacy' ? (
              <PrivacySettingsSection
                privacy={privacy}
                setPrivacy={setPrivacy}
                conversations={fixtures.conversations}
                blocked={fixtures.blockedUsers}
                onUnblock={fixtures.asyncNoop}
                onSave={fixtures.asyncNoop}
                busy={false}
              />
            ) : (
              <section><AppPreferencesSection /></section>
            )}
          </main>
        </div>
      )}
    </div>
  );
}
