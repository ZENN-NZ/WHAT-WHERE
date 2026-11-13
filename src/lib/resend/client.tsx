import "server-only";
import * as React from "react";
import { Resend } from "resend";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { UserRole } from "@/types/database";

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("Missing RESEND_API_KEY environment variable.");
  }
  return new Resend(apiKey);
}

interface WorkspaceInviteEmailProps {
  invitedEmail: string;
  invitedByEmail: string;
  role: UserRole;
  loginUrl: string;
}

export function WorkspaceInviteEmail({
  invitedEmail,
  invitedByEmail,
  role,
  loginUrl,
}: WorkspaceInviteEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>You have been invited to join WHAT-WHERE</Preview>
      <Body style={mainStyle}>
        <Container style={containerStyle}>
          <Heading style={headingStyle}>WHAT-WHERE Workspace</Heading>
          <Text style={paragraphStyle}>
            <strong>{invitedByEmail}</strong> has invited{" "}
            <strong>{invitedEmail}</strong> to join the WHAT-WHERE workspace as
            a <strong>{role}</strong>.
          </Text>
          <Text style={paragraphStyle}>
            Access is strictly invite-only and protected by 6-digit email OTP
            verification. Click below to sign in and request your one-time
            code:
          </Text>
          <Section style={buttonContainerStyle}>
            <Button style={buttonStyle} href={loginUrl}>
              Sign in to WHAT-WHERE
            </Button>
          </Section>
          <Hr style={hrStyle} />
          <Text style={footerStyle}>
            If you did not expect this invitation, you can safely ignore this
            message.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const mainStyle: React.CSSProperties = {
  backgroundColor: "#f7f6f3",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  padding: "40px 0",
};

const containerStyle: React.CSSProperties = {
  backgroundColor: "#ffffff",
  border: "1px solid #e6e5e2",
  borderRadius: "8px",
  margin: "0 auto",
  maxWidth: "480px",
  padding: "32px",
};

const headingStyle: React.CSSProperties = {
  color: "#191918",
  fontSize: "20px",
  fontWeight: 600,
  margin: "0 0 16px",
};

const paragraphStyle: React.CSSProperties = {
  color: "#37352f",
  fontSize: "14px",
  lineHeight: "22px",
  margin: "0 0 16px",
};

const buttonContainerStyle: React.CSSProperties = {
  margin: "24px 0",
};

const buttonStyle: React.CSSProperties = {
  backgroundColor: "#191918",
  borderRadius: "6px",
  color: "#ffffff",
  display: "inline-block",
  fontSize: "14px",
  fontWeight: 500,
  padding: "10px 20px",
  textDecoration: "none",
};

const hrStyle: React.CSSProperties = {
  borderColor: "#e6e5e2",
  margin: "24px 0",
};

const footerStyle: React.CSSProperties = {
  color: "#787774",
  fontSize: "12px",
  lineHeight: "18px",
  margin: 0,
};

export async function sendWorkspaceInviteEmail(params: {
  to: string;
  invitedByEmail: string;
  role: UserRole;
}) {
  const resend = getResendClient();
  const from =
    process.env.RESEND_FROM_EMAIL ||
    "Workspace Security <onboarding@resend.dev>";
  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  ).replace(/\/+$/, "");
  const loginUrl = `${appUrl}/login?email=${encodeURIComponent(params.to)}`;

  const { data, error } = await resend.emails.send({
    from,
    to: params.to,
    subject: "You're invited to WHAT-WHERE",
    react: React.createElement(WorkspaceInviteEmail, {
      invitedEmail: params.to,
      invitedByEmail: params.invitedByEmail,
      role: params.role,
      loginUrl,
    }),
  });

  if (error) {
    throw new Error(`Resend invite delivery failed: ${error.message}`);
  }

  return data;
}
