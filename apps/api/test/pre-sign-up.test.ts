import type { Context as LambdaContext, PreSignUpTriggerEvent } from "aws-lambda";
import { describe, expect, it } from "vitest";
import { handler } from "../src/pre-sign-up.ts";

function event(userAttributes: Record<string, string>): PreSignUpTriggerEvent {
  return {
    triggerSource: "PreSignUp_ExternalProvider",
    request: { userAttributes },
    response: { autoConfirmUser: false, autoVerifyEmail: false, autoVerifyPhone: false },
  } as unknown as PreSignUpTriggerEvent;
}

const lambdaContext = {} as LambdaContext;

function signUp(userAttributes: Record<string, string>) {
  return handler(event(userAttributes), lambdaContext, () => {});
}

describe("pre-sign-up", () => {
  it("lets a Google identity with a verified email sign up", async () => {
    const accepted = event({ email: "a@example.com", email_verified: "true" });
    await expect(handler(accepted, lambdaContext, () => {})).resolves.toBe(accepted);
  });

  it("rejects a Google identity whose email is not verified", async () => {
    await expect(signUp({ email: "a@example.com", email_verified: "false" })).rejects.toThrow(
      "not verified",
    );
  });

  it("rejects an identity that carries no verification claim at all", async () => {
    await expect(signUp({ email: "a@example.com" })).rejects.toThrow("not verified");
  });
});
