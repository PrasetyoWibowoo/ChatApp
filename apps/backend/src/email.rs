use anyhow::{Context, Result};
use rand::{distributions::Alphanumeric, Rng};
use reqwest::Client;
use serde_json::json;

#[derive(Clone, Copy, Debug)]
enum EmailProvider {
    SendGrid,
    Resend,
    Log,
}

pub struct EmailService {
    client: Client,
    provider: EmailProvider,
    resend_api_key: Option<String>,
    sendgrid_api_key: Option<String>,
    from_email: String,
}

fn parse_from_email(input: &str) -> (Option<String>, String) {
    // Accept either:
    // - "Name <email@example.com>"
    // - "email@example.com"
    let trimmed = input.trim();
    if let (Some(l), Some(r)) = (trimmed.find('<'), trimmed.find('>')) {
        if l < r {
            let name = trimmed[..l].trim().trim_matches('"');
            let email = trimmed[l + 1..r].trim();
            if !email.is_empty() {
                return (
                    if name.is_empty() { None } else { Some(name.to_string()) },
                    email.to_string(),
                );
            }
        }
    }
    (None, trimmed.to_string())
}

impl EmailService {
    pub fn new() -> Result<Self> {
        let provider_env = std::env::var("EMAIL_PROVIDER")
            .unwrap_or_else(|_| "".to_string())
            .trim()
            .to_lowercase();

        let resend_api_key = std::env::var("RESEND_API_KEY").ok().and_then(|v| {
            let trimmed = v.trim().to_string();
            if trimmed.is_empty() { None } else { Some(trimmed) }
        });

        let sendgrid_api_key = std::env::var("SENDGRID_API_KEY").ok().and_then(|v| {
            let trimmed = v.trim().to_string();
            if trimmed.is_empty() { None } else { Some(trimmed) }
        });

        // Prefer explicit provider sender, fallback to EMAIL_FROM.
        // For best deliverability (less spam), verify a domain and set SPF/DKIM.
        let from_email = std::env::var("SENDGRID_FROM_EMAIL")
            .ok()
            .filter(|v| !v.trim().is_empty())
            .or_else(|| {
                std::env::var("RESEND_FROM_EMAIL")
                    .ok()
                    .filter(|v| !v.trim().is_empty())
            })
            .or_else(|| {
                std::env::var("EMAIL_FROM")
                    .ok()
                    .filter(|v| !v.trim().is_empty())
            })
            .unwrap_or_else(|| "ChatApp <onboarding@resend.dev>".to_string());

        let provider = match provider_env.as_str() {
            "sendgrid" => EmailProvider::SendGrid,
            "log" => EmailProvider::Log,
            // default: prefer sendgrid if set, otherwise resend, otherwise log
            _ => {
                if sendgrid_api_key.is_some() {
                    EmailProvider::SendGrid
                } else if resend_api_key.is_some() {
                    EmailProvider::Resend
                } else {
                    EmailProvider::Log
                }
            }
        };

        match provider {
            EmailProvider::SendGrid => {
                log::info!("EmailService provider: SendGrid");
                log::info!("From email: {}", from_email);
            }
            EmailProvider::Resend => {
                log::info!("EmailService provider: Resend");
                log::info!("From email: {}", from_email);
            }
            EmailProvider::Log => {
                if provider_env != "log" {
                    log::warn!(
                        "No email API key set; falling back to EMAIL_PROVIDER=log (verification codes will be logged, not emailed)"
                    );
                } else {
                    log::info!("EmailService provider: log");
                }
            }
        }

        Ok(Self {
            client: Client::new(),
            provider,
            resend_api_key,
            sendgrid_api_key,
            from_email,
        })
    }

    pub fn generate_code() -> String {
        rand::thread_rng()
            .sample_iter(&Alphanumeric)
            .take(6)
            .map(|c| (c as char).to_uppercase().next().unwrap())
            .collect()
    }

    pub async fn send_verification_code(&self, to_email: &str, code: &str) -> Result<()> {
        if matches!(self.provider, EmailProvider::Log) {
            log::info!(
                "[EmailVerification][LOG] to={} code={} (set RESEND_API_KEY + RESEND_FROM_EMAIL to send real email)",
                to_email,
                code
            );
            return Ok(());
        }

        let html_body = format!(
            r#"<html>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #4a5568;">Email Verification</h2>
        <p>Hello,</p>
        <p>Your verification code is:</p>
        <div style="background-color: #f7fafc; border: 2px solid #4299e1; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
            <h1 style="color: #2d3748; letter-spacing: 8px; margin: 0; font-size: 32px;">{}</h1>
        </div>
        <p>This code will expire in <strong>10 minutes</strong>.</p>
        <p>If you didn't request this code, please ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
        <p style="color: #718096; font-size: 12px;">
            This is an automated email from ChatApp. Please do not reply.
        </p>
    </div>
</body>
</html>"#,
            code
        );

        let text_body = format!(
            "Kode verifikasi ChatApp Anda: {}\n\nBerlaku 10 menit. Jika Anda tidak merasa meminta kode ini, abaikan email ini.",
            code
        );

        match self.provider {
            EmailProvider::SendGrid => {
                let Some(sendgrid_api_key) = self.sendgrid_api_key.as_deref() else {
                    log::warn!("SendGrid provider selected but SENDGRID_API_KEY missing; skipping email send");
                    return Ok(());
                };

                let (from_name, from_email_addr) = parse_from_email(&self.from_email);

                let from_json = match from_name {
                    Some(name) => json!({"email": from_email_addr, "name": name}),
                    None => json!({"email": from_email_addr}),
                };

                let response = self
                    .client
                    .post("https://api.sendgrid.com/v3/mail/send")
                    .header("Authorization", format!("Bearer {}", sendgrid_api_key))
                    .header("Content-Type", "application/json")
                    .json(&json!({
                        "personalizations": [{
                            "to": [{"email": to_email}],
                            "subject": "Kode Verifikasi ChatApp"
                        }],
                        "from": from_json,
                        "content": [
                            {"type": "text/plain", "value": text_body},
                            {"type": "text/html", "value": html_body}
                        ]
                    }))
                    .send()
                    .await
                    .context("Failed to send request to SendGrid API")?;

                if !response.status().is_success() {
                    let status = response.status();
                    let body = response.text().await.unwrap_or_default();
                    anyhow::bail!("SendGrid API error ({}): {}", status, body);
                }

                log::info!("Verification email sent successfully to {} (SendGrid)", to_email);
                return Ok(());
            }
            EmailProvider::Resend => {
                // continue to Resend implementation below
            }
            EmailProvider::Log => {
                // handled above
            }
        }

        let Some(resend_api_key) = self.resend_api_key.as_deref() else {
            // Defensive: should not happen because provider selection falls back to Log.
            log::warn!("Resend provider selected but RESEND_API_KEY missing; skipping email send");
            return Ok(());
        };

        let response = self.client
            .post("https://api.resend.com/emails")
            .header("Authorization", format!("Bearer {}", resend_api_key))
            .header("Content-Type", "application/json")
            .json(&json!({
                "from": self.from_email,
                "to": [to_email],
                "subject": "Kode Verifikasi ChatApp",
                "html": html_body,
                "text": text_body
            }))
            .send()
            .await
            .context("Failed to send request to Resend API")?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            anyhow::bail!("Resend API error ({}): {}", status, body);
        }

        log::info!("Verification email sent successfully to {}", to_email);
        Ok(())
    }
}
