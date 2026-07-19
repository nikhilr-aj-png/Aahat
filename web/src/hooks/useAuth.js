import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';

/**
 * useAuth — Handles authentication state, session management,
 * profile creation/sync, and user lifecycle.
 */
export function useAuth() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch full profile from profiles table
  const fetchProfile = useCallback(async (userId) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error fetching profile:', error);
      return null;
    }
    return data;
  }, []);

  // Ensure profile exists (auto-created by trigger, but we sync metadata)
  const ensureProfile = useCallback(async (authUser) => {
    let prof = await fetchProfile(authUser.id);

    if (!prof) {
      // Profile should be auto-created by trigger, but retry after a brief delay
      await new Promise(r => setTimeout(r, 500));
      prof = await fetchProfile(authUser.id);
    }

    // If profile still doesn't exist, create it manually (trigger may not have fired)
    if (!prof) {
      console.warn('Profile not found for user, creating manually:', authUser.id);
      const metaName = authUser.user_metadata?.name;
      const displayName = (typeof metaName === 'string' ? metaName : null) ||
                          authUser.email?.split('@')[0] || 'User';

      const { data: created, error: createErr } = await supabase
        .from('profiles')
        .upsert({
          id: authUser.id,
          email: authUser.email,
          display_name: displayName,
          username: authUser.email?.split('@')[0] || authUser.id.substring(0, 8),
          avatar_url: authUser.user_metadata?.avatarUrl || '',
        }, { onConflict: 'id' })
        .select()
        .single();

      if (createErr) {
        console.error('Error creating profile:', createErr);
      } else {
        prof = created;
      }
    }

    if (prof) {
      // Sync only display name from auth metadata. Avatar URL in profiles is the database source of truth.
      const metaName = authUser.user_metadata?.name;
      const nameStr = typeof metaName === 'string' ? metaName : null;
      if (nameStr && nameStr !== prof.display_name) {
        const { data: updated } = await supabase
          .from('profiles')
          .update({ display_name: nameStr })
          .eq('id', authUser.id)
          .select()
          .single();

        if (updated) prof = updated;
      }
    }

    setProfile(prof);
    return prof;
  }, [fetchProfile]);

  // Handle session change
  const handleSession = useCallback(async (session) => {
    if (!session) {
      setUser(null);
      setProfile(null);
      setIsLoading(false);
      return;
    }

    const currentProfile = await ensureProfile(session.user);
    if (currentProfile?.account_status && currentProfile.account_status !== 'active') {
      await supabase.auth.signOut();
      setUser(null);
      setProfile(null);
      setIsLoading(false);
      return;
    }
    setUser(session.user);

    // Update online status
    await supabase
      .from('profiles')
      .update({ is_online: currentProfile?.privacy_settings?.online !== false, last_seen: new Date().toISOString() })
      .eq('id', session.user.id);

    setIsLoading(false);
  }, [ensureProfile]);

  // Initialize auth state
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      handleSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        handleSession(session);
      }
    );

    return () => subscription.unsubscribe();
  }, [handleSession]);

  // Keep this device synced when the same account updates profile/settings elsewhere.
  useEffect(() => {
    if (!user?.id) return undefined;

    const channel = supabase
      .channel(`profile-sync-${user.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'profiles',
        filter: `id=eq.${user.id}`
      }, (payload) => {
        if (payload.new) setProfile(payload.new);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  // Presence is synchronized while the page is visible. Realtime presence remains
  // authoritative for instant UI; these profile fields provide a durable fallback.
  useEffect(() => {
    if (!user?.id) return undefined;
    const onlineSharingEnabled = profile?.privacy_settings?.online !== false;
    const syncPresence = (online) => supabase.from('profiles').update({
      is_online: online, last_seen: new Date().toISOString()
    }).eq('id', user.id).then(({ error }) => {
      if (error) console.warn('Could not sync profile presence:', error.message);
    });
    const shouldBeOnline = () => onlineSharingEnabled && navigator.onLine && document.visibilityState === 'visible';
    const handleVisibility = () => { void syncPresence(shouldBeOnline()); };
    const handlePageHide = () => { void syncPresence(false); };
    handleVisibility();
    const heartbeat = window.setInterval(handleVisibility, 15000);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', handleVisibility);
    window.addEventListener('offline', handleVisibility);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', handleVisibility);
      window.removeEventListener('offline', handleVisibility);
      window.removeEventListener('pagehide', handlePageHide);
      void syncPresence(false);
    };
  }, [profile?.privacy_settings?.online, user?.id]);
  // Auth actions
  const signUp = useCallback(async (email, password, name) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } }
    });
    if (error) throw error;
    return data;
  }, []);

  const signIn = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    if (error) throw error;
    return data;
  }, []);

  const verifyOtp = useCallback(async (email, token) => {
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'signup'
    });
    if (error) throw error;
    return data;
  }, []);

  const signOut = useCallback(async () => {
    if (user) {
      await supabase
        .from('profiles')
        .update({ is_online: false, last_seen: new Date().toISOString() })
        .eq('id', user.id);
    }
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  }, [user]);

  const resetPassword = useCallback(async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) throw error;
  }, []);

  const updatePassword = useCallback(async (newPassword) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  }, []);

  const updateProfile = useCallback(async (updates) => {
    if (!user) return null;

    // Update auth metadata
    const authUpdates = {};
    if (updates.display_name) authUpdates.name = updates.display_name;

    if (Object.keys(authUpdates).length > 0) {
      await supabase.auth.updateUser({ data: authUpdates });
    }

    const nextUpdates = { ...updates };
    delete nextUpdates.email;
    delete nextUpdates.virtual_number;
    delete nextUpdates.role;

    // Update profiles table
    const { data, error } = await supabase
      .from('profiles')
      .update(nextUpdates)
      .eq('id', user.id)
      .select()
      .single();

    if (error) throw error;
    setProfile(data);
    return data;
  }, [user]);

  return {
    user,
    profile,
    isLoading,
    signUp,
    signIn,
    verifyOtp,
    signOut,
    resetPassword,
    updatePassword,
    updateProfile,
    fetchProfile
  };
}
