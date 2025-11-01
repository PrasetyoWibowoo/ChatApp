use anyhow::{Context, Result};
use lettre::{
    message::{header::ContentType, Message},
    transport::smtp::authentication::Credentials,
    AsyncSmtpTransport, AsyncTransport, Tokio1Executor,
};
use rand::{distributions::Alphanumeric, Rng};

pub struct EmailService {
    mailer: AsyncSmtpTransport<Tokio1Executor>,
    from_email: String,
}

impl EmailService {
    pub fn new() -> Result<Self> {
        let smtp_server = std::env::var("SMTP_SERVER")
            .unwrap_or_else(|_| "smtp.gmail.com".to_string());
        let smtp_username = std::env::var("SMTP_USERNAME")
            .context("SMTP_USERNAME must be set")?;
        let smtp_password = std::env::var("SMTP_PASSWORD")
            .context("SMTP_PASSWORD must be set")?;
        let from_email = std::env::var("SMTP_FROM_EMAIL")
            .unwrap_or_else(|_| smtp_username.clone());

        let creds = Credentials::new(smtp_username, smtp_password);

        let mailer = AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&smtp_server)?
            .credentials(creds)
            .build();

        Ok(Self { mailer, from_email })
    }

    pub fn generate_code() -> String {
        rand::thread_rng()
            .sample_iter(&Alphanumeric)
            .take(6)
            .map(|c| (c as char).to_uppercase().next().unwrap())
            .collect()
    }

    pub async fn send_verification_code(&self, to_email: &str, code: &str) -> Result<()> {
        let email = Message::builder()
            .from(self.from_email.parse()?)
            .to(to_email.parse()?)
            .subject("Email Verification Code - Collaboration Notes")
            .header(ContentType::TEXT_HTML)
            .body(format!(
                r#"
                <html>
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
                            This is an automated email from Collaboration Notes. Please do not reply.
                        </p>
                    </div>
                </body>
                </html>
                "#,
                code
            ))?;

        self.mailer.send(email).await?;
        Ok(())
    }
}
