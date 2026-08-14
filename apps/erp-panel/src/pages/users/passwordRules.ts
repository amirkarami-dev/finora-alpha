/**
 * Shared between the three places a password or a user error is handled.
 *
 * The minimum mirrors `UserAdminService.MinimumPasswordLength` on the server. The client check
 * exists to say so before a round trip, not instead of the server's — which is why the server
 * sends the number back in the error payload rather than trusting this constant.
 */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * Which form field an error code belongs against, or undefined for a toast.
 *
 * One map across three forms, so a code lands on the same field wherever it surfaces. The
 * returned name is widened to the union of every field it can name; each caller passes it
 * straight to `form.setFields`, whose own typing narrows it to that form's fields.
 */
export type UserFormField =
  | 'email'
  | 'name'
  | 'role'
  | 'password'
  | 'newPassword'
  | 'currentPassword';

const FIELD_FOR_ERROR: Record<string, UserFormField> = {
  'email-required': 'email',
  'duplicate-email': 'email',
  'name-required': 'name',
  'role-not-found': 'role',
  'password-too-short': 'password',
  'current-password-incorrect': 'currentPassword',
};

export function fieldErrorFor(code: string): UserFormField | undefined {
  return FIELD_FOR_ERROR[code];
}
