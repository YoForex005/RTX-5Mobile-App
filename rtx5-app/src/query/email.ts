import { useMutation } from '@tanstack/react-query';
import { sendEmail, SendEmailRequest, SendEmailResponse } from '../api/email';

/**
 * TanStack Mutation hook for sending emails via MT5 SMTP.
 *
 * Usage:
 * ```ts
 * const { mutate: send, isPending } = useSendEmail();
 * send({ account: '', to: 'user@example.com', to_name: 'User', subject: 'Hello', body: 'Welcome!' });
 * ```
 */
export function useSendEmail() {
  return useMutation<SendEmailResponse, Error, SendEmailRequest>({
    mutationFn: sendEmail,
  });
}
