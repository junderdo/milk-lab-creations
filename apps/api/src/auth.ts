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
  /**
   * Pool username, which is how the user directory is addressed.
   *
   * Not the sub: a federated user's username is `google_<id>`, and the pool
   * does not answer `AdminGetUser` for a sub at all.
   */
  username: string;
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
    // every Cognito access token carries `username`, but the verifier types the
    // payload loosely; a token without one cannot be provisioned from
    if (typeof claims.username !== "string") return null;
    return { sub: claims.sub, username: claims.username };
  } catch {
    return null;
  }
}

let cognito: CognitoIdentityProviderClient | undefined;

/** Fetches email/name for JIT user provisioning, by pool username. */
export async function fetchProfile(username: string): Promise<Profile> {
  cognito ??= new CognitoIdentityProviderClient({});
  const result = await cognito.send(
    new AdminGetUserCommand({ UserPoolId: Resource.UserPool.id, Username: username }),
  );
  const attrs = new Map(result.UserAttributes?.map((a) => [a.Name, a.Value]));
  const email = attrs.get("email") ?? "";
  return { email, displayName: attrs.get("name") ?? (email || "New user") };
}
