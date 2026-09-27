// Cognito pre-sign-up trigger. Throwing aborts the sign-up, so no pool user is
// created for an identity whose email Google has not verified.
import type { PreSignUpTriggerHandler } from "aws-lambda";

export const handler: PreSignUpTriggerHandler = async (event) => {
  // Cognito passes mapped attributes as strings, so Google's boolean arrives as "true"
  if (event.request.userAttributes.email_verified !== "true") {
    throw new Error("Email address is not verified");
  }
  return event;
};
