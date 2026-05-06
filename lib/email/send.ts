import { Resend } from "resend";

let resend: Resend | null = null;

function getResend() {
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY!);
  }

  return resend;
}

export async function sendEmail(to: string[], subject: string, html: string) {
  return getResend().emails.send({
    from: process.env.EMAIL_FROM!,
    to,
    subject,
    html,
  });
}
