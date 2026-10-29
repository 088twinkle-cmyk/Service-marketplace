import { StorageKeys, removeItems } from "../utils/storage";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type AuthData = {
  access: string;
  refresh?: string;
  role: string;
  username: string;
  email?: string;
};

export const setAuth = async (data: AuthData) => {
  const pairs: [string, string][] = [
    [StorageKeys.TOKEN, data.access],
    [StorageKeys.ROLE, data.role],
    [StorageKeys.USERNAME, data.username],
  ];
  if (data.refresh) pairs.push([StorageKeys.REFRESH_TOKEN, data.refresh]);
  if (data.email) pairs.push([StorageKeys.EMAIL, data.email]);
  await AsyncStorage.multiSet(pairs);
};

export const getAuth = async () => {
  const [token, refreshToken, role, username, email] = await AsyncStorage.multiGet([
    StorageKeys.TOKEN,
    StorageKeys.REFRESH_TOKEN,
    StorageKeys.ROLE,
    StorageKeys.USERNAME,
    StorageKeys.EMAIL,
  ]);
  return {
    token: token[1],
    refreshToken: refreshToken[1],
    role: role[1],
    username: username[1],
    email: email[1],
  };
};

export const logout = async () => {
  await removeItems([
    StorageKeys.TOKEN,
    StorageKeys.REFRESH_TOKEN,
    StorageKeys.ROLE,
    StorageKeys.USERNAME,
    StorageKeys.PROFILE_COMPLETED,
    StorageKeys.KYC_STATUS,
    StorageKeys.SERVICES,
    StorageKeys.PENDING_REGISTRATION_ID,
    StorageKeys.PENDING_REGISTRATION_EMAIL,
  ]);
};

/**
 * Pending email OTP registration context.
 *
 * The OTP screen keeps this in storage so the verification survives a page
 * refresh: the registration id and email address are enough to resume
 * (or re-request) the code.
 */
export const setPendingRegistration = async (data: {
  registrationId: string;
  email: string;
}) => {
  await AsyncStorage.multiSet([
    [StorageKeys.PENDING_REGISTRATION_ID, data.registrationId],
    [StorageKeys.PENDING_REGISTRATION_EMAIL, data.email],
  ]);
};

export const getPendingRegistration = async () => {
  const [[, registrationId], [, email]] = await AsyncStorage.multiGet([
    StorageKeys.PENDING_REGISTRATION_ID,
    StorageKeys.PENDING_REGISTRATION_EMAIL,
  ]);
  return {
    registrationId: registrationId ?? undefined,
    email: email ?? undefined,
  };
};

export const clearPendingRegistration = async () => {
  await removeItems([
    StorageKeys.PENDING_REGISTRATION_ID,
    StorageKeys.PENDING_REGISTRATION_EMAIL,
  ]);
};

export { getPostLoginRoute, resolveInitialRoute } from "../navigation/workflow";
export { Routes } from "../navigation/routes";
