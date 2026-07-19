export const formatMfaFactorName = name => {
  const value = typeof name === 'string' ? name.trim() : '';
  if (!value) return 'Aahat Authenticator';
  return value.replace(/\s+[A-F0-9]{6}$/i, '');
};
