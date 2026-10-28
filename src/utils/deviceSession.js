// Firebase's SDK refreshes expired ID tokens before returning these claims.
// Reusing a session never substitutes the online device/grant checks.
export function matchesDeviceSession(claims,uid,deviceId) {
  return claims?.sub===uid && claims?.deviceId===deviceId
    && typeof deviceId==='string' && deviceId.startsWith('d_')
    && claims?.firebase?.sign_in_provider==='custom';
}

export async function ensureDeviceSession({user,deviceId,authorize,signIn}) {
  const {claims}=await user.getIdTokenResult();
  if(matchesDeviceSession(claims,user.uid,deviceId))return;
  const {customToken}=await authorize();
  await signIn(customToken);
}
