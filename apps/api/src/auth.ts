// Stateless bearer-token auth: verifies Cognito access tokens against the
// pool JWKS. Profile claims (email, name) are not in access tokens, so JIT
// provisioning fetches them via AdminGetUser (the UserPool link grants it).
import {
  AdminGetUserCommand,
  CognitoIdentityProviderClient,
} from "@aws-sdk/client-cognito-identity-provider";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { Resource } from "sst";

export interface AuthUser {
  /** Cognito sub — also the users.id primary key. */
  sub: string;
}

export interface Profile {
  email: string;
  displayName: string;
}

let verifier: ReturnType<typeof CognitoJwtVerifier.create> | undefined;

/** Returns the verified caller, or null for anonymous/invalid tokens. */
export async function verifyBearer(authorization: string | undefined): Promise<AuthUser | null> {
  if (!authorization?.startsWith("Bearer ")) return null;
  verifier ??= CognitoJwtVerifier.create({
    userPoolId: Resource.UserPool.id,
    tokenUse: "access",
    clientId: Resource.WebClient.id,
  });
  try {
    const claims = await verifier.verify(authorization.slice("Bearer ".length));
    return { sub: claims.sub };
  } catch {
    return null;
  }
}

let cognito: CognitoIdentityProviderClient | undefined;

/** Fetches email/name for JIT user provisioning. */
export async function fetchProfile(sub: string): Promise<Profile> {
  cognito ??= new CognitoIdentityProviderClient({});
  const result = await cognito.send(
    new AdminGetUserCommand({ UserPoolId: Resource.UserPool.id, Username: sub }),
  );
  const attrs = new Map(result.UserAttributes?.map((a) => [a.Name, a.Value]));
  const email = attrs.get("email") ?? "";
  return { email, displayName: attrs.get("name") ?? email ?? "New user" };
}
