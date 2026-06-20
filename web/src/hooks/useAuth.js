import { useState, useEffect, useCallback } from 'react';
import { supabase, supabaseUrl } from '../supabase';

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

    if (prof) {
      // Sync display name and avatar from auth metadata if different
      const metaName = authUser.user_metadata?.name;
      const metaAvatar = authUser.user_metadata?.avatarUrl;
      const needsSync = (metaName && metaName !== prof.display_name) ||
                        (metaAvatar && metaAvatar !== prof.avatar_url);
      if (needsSync) {
        const updates = {};
        if (metaName && metaName !== prof.display_name) updates.display_name = metaName;
        if (metaAvatar && metaAvatar !== prof.avatar_url) updates.avatar_url = metaAvatar;

        const { data: updated } = await supabase
          .from('profiles')
          .update(updates)
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

    setUser(session.user);
    await ensureProfile(session.user);

    // Update online status
    await supabase
      .from('profiles')
      .update({ is_online: true, last_seen: new Date().toISOString() })
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

  // Set offline on page unload
  useEffect(() => {
    const handleUnload = () => {
      if (user) {
        // Use sendBeacon for reliable offline status
        const url = `${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}`;
        const body = JSON.stringify({ is_online: false, last_seen: new Date().toISOString() });
        navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
      }
    };

    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, [user]);

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
    if (updates.avatar_url !== undefined) authUpdates.avatarUrl = updates.avatar_url;

    if (Object.keys(authUpdates).length > 0) {
      await supabase.auth.updateUser({ data: authUpdates });
    }

    // Update profiles table
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
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
