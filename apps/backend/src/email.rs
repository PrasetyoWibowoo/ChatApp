use anyhow::{Context, Result};use anyhow::{Context, Result};use anyhow::{Context, Result};

use rand::{distributions::Alphanumeric, Rng};

use reqwest::Client;use rand::{distributions::Alphanumeric, Rng};use lettre::{

use serde_json::json;

use reqwest::Client;    message::{header::ContentType, Message},

pub struct EmailService {

    client: Client,use serde_json::json;    transport::smtp::authentication::Credentials,

    resend_api_key: String,

    from_email: String,    AsyncSmtpTransport, AsyncTransport, Tokio1Executor,

}

pub struct EmailService {};

impl EmailService {

    pub fn new() -> Result<Self> {    client: Client,use rand::{distributions::Alphanumeric, Rng};

        let resend_api_key = std::env::var("RESEND_API_KEY")

            .context("RESEND_API_KEY must be set (get free key from resend.com)")?;    resend_api_key: String,

        let from_email = std::env::var("SMTP_FROM_EMAIL")

            .unwrap_or_else(|_| "onboarding@resend.dev".to_string());    from_email: String,pub struct EmailService {



        log::info!("Initializing EmailService with Resend API");}    mailer: AsyncSmtpTransport<Tokio1Executor>,

        log::info!("From email: {}", from_email);

    from_email: String,

        let client = Client::new();

impl EmailService {}

        log::info!("EmailService initialized successfully");

    pub fn new() -> Result<Self> {

        Ok(Self { 

            client,        let resend_api_key = std::env::var("RESEND_API_KEY")impl EmailService {

            resend_api_key,

            from_email             .context("RESEND_API_KEY must be set (get free key from resend.com)")?;    pub fn new() -> Result<Self> {

        })

    }        let from_email = std::env::var("SMTP_FROM_EMAIL")        let smtp_server = std::env::var("SMTP_SERVER")



    pub fn generate_code() -> String {            .unwrap_or_else(|_| "onboarding@resend.dev".to_string());            .unwrap_or_else(|_| "smtp.gmail.com".to_string());

        rand::thread_rng()

            .sample_iter(&Alphanumeric)        let smtp_username = std::env::var("SMTP_USERNAME")

            .take(6)

            .map(|c| (c as char).to_uppercase().next().unwrap())        log::info!("Initializing EmailService with Resend API");            .context("SMTP_USERNAME must be set")?;

            .collect()

    }        log::info!("From email: {}", from_email);        let smtp_password = std::env::var("SMTP_PASSWORD")



    pub async fn send_verification_code(&self, to_email: &str, code: &str) -> Result<()> {            .context("SMTP_PASSWORD must be set")?;

        let html_body = format!(

            r#"        let client = Client::new();        let from_email = std::env::var("SMTP_FROM_EMAIL")

            <html>

            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">            .unwrap_or_else(|_| smtp_username.clone());

                <div style="max-width: 600px; margin: 0 auto; padding: 20px;">

                    <h2 style="color: #4a5568;">Email Verification</h2>        log::info!("EmailService initialized successfully");

                    <p>Hello,</p>

                    <p>Your verification code is:</p>        let creds = Credentials::new(smtp_username, smtp_password);

                    <div style="background-color: #f7fafc; border: 2px solid #4299e1; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">

                        <h1 style="color: #2d3748; letter-spacing: 8px; margin: 0; font-size: 32px;">{}</h1>        Ok(Self { 

                    </div>

                    <p>This code will expire in <strong>10 minutes</strong>.</p>            client,        let mailer = AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&smtp_server)?

                    <p>If you didn't request this code, please ignore this email.</p>

                    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">            resend_api_key,            .credentials(creds)

                    <p style="color: #718096; font-size: 12px;">

                        This is an automated email from ChatApp. Please do not reply.            from_email             .build();

                    </p>

                </div>        })

            </body>

            </html>    }        Ok(Self { mailer, from_email })

            "#,

            code    }

        );

    pub fn generate_code() -> String {

        let response = self.client

            .post("https://api.resend.com/emails")        rand::thread_rng()    pub fn generate_code() -> String {

            .header("Authorization", format!("Bearer {}", self.resend_api_key))

            .header("Content-Type", "application/json")            .sample_iter(&Alphanumeric)        rand::thread_rng()

            .json(&json!({

                "from": self.from_email,            .take(6)            .sample_iter(&Alphanumeric)

                "to": [to_email],

                "subject": "Email Verification Code - ChatApp",            .map(|c| (c as char).to_uppercase().next().unwrap())            .take(6)

                "html": html_body

            }))            .collect()            .map(|c| (c as char).to_uppercase().next().unwrap())

            .send()

            .await    }            .collect()

            .context("Failed to send request to Resend API")?;

    }

        if !response.status().is_success() {

            let status = response.status();    pub async fn send_verification_code(&self, to_email: &str, code: &str) -> Result<()> {

            let body = response.text().await.unwrap_or_default();

            anyhow::bail!("Resend API error ({}): {}", status, body);        let html_body = format!(    pub async fn send_verification_code(&self, to_email: &str, code: &str) -> Result<()> {

        }

            r#"        let html_body = format!(

        log::info!("Verification email sent successfully to {}", to_email);

        Ok(())            <html>            r#"

    }

}            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">            <html>


                <div style="max-width: 600px; margin: 0 auto; padding: 20px;">            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">

                    <h2 style="color: #4a5568;">Email Verification</h2>                <div style="max-width: 600px; margin: 0 auto; padding: 20px;">

                    <p>Hello,</p>                    <h2 style="color: #4a5568;">Email Verification</h2>

                    <p>Your verification code is:</p>                    <p>Hello,</p>

                    <div style="background-color: #f7fafc; border: 2px solid #4299e1; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">                    <p>Your verification code is:</p>

                        <h1 style="color: #2d3748; letter-spacing: 8px; margin: 0; font-size: 32px;">{}</h1>                    <div style="background-color: #f7fafc; border: 2px solid #4299e1; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">

                    </div>                        <h1 style="color: #2d3748; letter-spacing: 8px; margin: 0; font-size: 32px;">{}</h1>

                    <p>This code will expire in <strong>10 minutes</strong>.</p>                    </div>

                    <p>If you didn't request this code, please ignore this email.</p>                    <p>This code will expire in <strong>10 minutes</strong>.</p>

                    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">                    <p>If you didn't request this code, please ignore this email.</p>

                    <p style="color: #718096; font-size: 12px;">                    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">

                        This is an automated email from ChatApp. Please do not reply.                    <p style="color: #718096; font-size: 12px;">

                    </p>                        This is an automated email from ChatApp. Please do not reply.

                </div>                    </p>

            </body>                </div>

            </html>            </body>

            "#,            </html>

            code            "#,

        );            code

        );

        let response = self.client

            .post("https://api.resend.com/emails")        let response = self.client

            .header("Authorization", format!("Bearer {}", self.resend_api_key))            .post("https://api.resend.com/emails")

            .header("Content-Type", "application/json")            .header("Authorization", format!("Bearer {}", self.resend_api_key))

            .json(&json!({            .header("Content-Type", "application/json")

                "from": self.from_email,            .json(&json!({

                "to": [to_email],                "from": self.from_email,

                "subject": "Email Verification Code - ChatApp",                "to": [to_email],

                "html": html_body                "subject": "Email Verification Code - ChatApp",

            }))                "html": html_body

            .send()            }))

            .await            .send()

            .context("Failed to send request to Resend API")?;            .await

            .context("Failed to send request to Resend API")?;

        if !response.status().is_success() {

            let status = response.status();        if !response.status().is_success() {

            let body = response.text().await.unwrap_or_default();            let status = response.status();

            anyhow::bail!("Resend API error ({}): {}", status, body);            let body = response.text().await.unwrap_or_default();

        }            anyhow::bail!("Resend API error ({}): {}", status, body);

        }

        log::info!("Verification email sent successfully to {}", to_email);

        Ok(())        log::info!("Verification email sent successfully to {}", to_email);

    }        Ok(())

}    }

}
