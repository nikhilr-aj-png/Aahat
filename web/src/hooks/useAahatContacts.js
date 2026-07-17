import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase';

export function useAahatContacts(user, onContactsChanged) {
  const [credentials, setCredentials] = useState(null);
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [outgoingRequests, setOutgoingRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setCredentials(null);
      setIncomingRequests([]);
      setOutgoingRequests([]);
      return;
    }

    setIsLoading(true);
    try {
      const [credentialResult, requestResult] = await Promise.all([
        supabase.rpc('get_my_aahat_credentials'),
        supabase
          .from('contact_requests')
          .select(`
            id, requester_id, recipient_id, status, created_at, responded_at,
            requester:profiles!contact_requests_requester_id_fkey(id, display_name, avatar_url, virtual_number),
            recipient:profiles!contact_requests_recipient_id_fkey(id, display_name, avatar_url, virtual_number)
          `)
          .order('created_at', { ascending: false })
      ]);

      if (credentialResult.error) throw credentialResult.error;
      if (requestResult.error) throw requestResult.error;

      setCredentials(credentialResult.data?.[0] || null);
      const requests = requestResult.data || [];
      setIncomingRequests(requests.filter(row => row.recipient_id === user.id));
      setOutgoingRequests(requests.filter(row => row.requester_id === user.id));
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh().catch(error => console.warn('Could not load Aahat invitations:', error));
  }, [refresh]);

  useEffect(() => {
    if (!user) return undefined;
    const channel = supabase
      .channel(`aahat-contact-requests-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contact_requests' }, () => {
        refresh().catch(error => console.warn('Could not refresh Aahat invitations:', error));
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [user, refresh]);

  const requestContact = useCallback(async (aahatId, pinCode) => {
    const normalizedId = (aahatId || '').replace(/\D/g, '');
    const normalizedPin = (pinCode || '').replace(/\D/g, '');
    if (!/^\d{10}$/.test(normalizedId)) throw new Error('Enter a valid 10-digit Aahat ID.');
    if (!/^\d{6}$/.test(normalizedPin)) throw new Error('Enter the 6-digit connection PIN.');

    const { data, error } = await supabase.rpc('request_contact_by_aahat_credentials', {
      p_aahat_id: normalizedId,
      p_pin_code: normalizedPin
    });
    if (error) throw error;
    await refresh();
    return data?.[0] || null;
  }, [refresh]);

  const respondToRequest = useCallback(async (requestId, accept) => {
    const { data: conversationId, error } = await supabase.rpc('respond_to_contact_request', {
      p_request_id: requestId,
      p_accept: accept
    });
    if (error) throw error;
    await Promise.all([refresh(), accept ? onContactsChanged?.() : Promise.resolve()]);
    return conversationId || null;
  }, [onContactsChanged, refresh]);

  const rotatePin = useCallback(async () => {
    const { data: pinCode, error } = await supabase.rpc('rotate_my_aahat_pin');
    if (error) throw error;
    setCredentials(current => ({ ...(current || {}), pin_code: pinCode }));
    return pinCode;
  }, []);

  return {
    credentials,
    incomingRequests,
    outgoingRequests,
    isLoading,
    refresh,
    requestContact,
    respondToRequest,
    rotatePin
  };
}
