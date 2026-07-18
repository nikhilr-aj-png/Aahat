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
        Promise.all([refresh(), onContactsChanged?.()])
          .catch(error => console.warn('Could not refresh Aahat contacts:', error));
      })
      .subscribe();
    const contactsChannel = supabase
      .channel(`aahat-user-contacts-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_contacts', filter: `owner_id=eq.${user.id}` }, () => {
        Promise.all([refresh(), onContactsChanged?.()])
          .catch(error => console.warn('Could not refresh connected contacts:', error));
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(contactsChannel);
    };
  }, [user, refresh, onContactsChanged]);

  const requestContact = useCallback(async (aahatId, pinCode) => {
    const normalizedId = (aahatId || '').replace(/\D/g, '');
    const normalizedPin = (pinCode || '').replace(/\D/g, '');
    if (!/^\d{10}$/.test(normalizedId)) throw new Error('Enter a valid 10-digit Aahat ID.');
    if (normalizedPin && !/^\d{6}$/.test(normalizedPin)) throw new Error('Enter the complete 6-digit connection PIN.');

    const { data, error } = await supabase.rpc('connect_by_aahat_id', {
      p_aahat_id: normalizedId,
      p_pin_code: normalizedPin || null
    });
    if (error) {
      if (!normalizedPin && /private connections/i.test(error.message || '')) {
        const pinRequiredError = new Error('This profile is private. Enter the 6-digit connection PIN to send an invitation.');
        pinRequiredError.code = 'AAHAT_PIN_REQUIRED';
        throw pinRequiredError;
      }
      throw error;
    }
    await Promise.all([refresh(), data?.[0]?.conversation_id ? onContactsChanged?.() : Promise.resolve()]);
    return data?.[0] || null;
  }, [onContactsChanged, refresh]);

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

  const removeContact = useCallback(async contactId => {
    const { data, error } = await supabase.rpc('remove_contact_for_both', {
      p_contact_id: contactId
    });
    if (error) throw error;
    await Promise.all([refresh(), onContactsChanged?.()]);
    return data === true;
  }, [onContactsChanged, refresh]);

  return {
    credentials,
    incomingRequests,
    outgoingRequests,
    isLoading,
    refresh,
    requestContact,
    respondToRequest,
    rotatePin,
    removeContact
  };
}
