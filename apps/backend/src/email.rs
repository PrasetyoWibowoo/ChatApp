use anyhow::{Context, Result};
use rand::{distributions::Alphanumeric, Rng};
use reqwest::Client;
use serde_json::json;

pub struct EmailService {
    client: Client,
    resend_api_key: String,
    from_email: String,
}

impl EmailService {
    pub fn new() -> Result<Self> {
        let resend_api_key = std::env::var("RESEND_API_KEY")
            .context("RESEND_API_KEY must be set (get free key from resend.com)")?;
        
        // Use registered email for free tier (can only send to same email without domain verification)
        let from_email = std::env::var("SMTP_FROM_EMAIL")
            .unwrap_or_else(|_| "wibowoprasetyo40@gmail.com".to_string());

        log::info!("Initializing EmailService with Resend API");
        log::info!("From email: {}", from_email);

        let client = Client::new();
        log::info!("EmailService initialized successfully");

        Ok(Self { 
            client,
            resend_api_key,
            from_email 
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

        let response = self.client
            .post("https://api.resend.com/emails")
            .header("Authorization", format!("Bearer {}", self.resend_api_key))
            .header("Content-Type", "application/json")
            .json(&json!({
                "from": self.from_email,
                "to": [to_email],
                "subject": "Email Verification Code - ChatApp",
                "html": html_body
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
