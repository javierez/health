import { createAuthClient } from "better-auth/react";

export const { signIn, signOut, changePassword, getSession } = createAuthClient({ baseURL: "" });
