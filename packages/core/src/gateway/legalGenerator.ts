export function generatePrivacyPolicyHtml(): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nyxora Local Agent - Privacy Policy</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #eceff4; background-color: #2e3440; max-width: 800px; margin: 0 auto; padding: 40px 20px; }
    h1, h2 { color: #88c0d0; }
    a { color: #81a1c1; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .container { background-color: #3b4252; padding: 32px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
  </style>
</head>
<body>
  <div class="container">
    <h1>Privacy Policy for Nyxora Local Agent</h1>
    <p><em>Last Updated: June 2026</em></p>
    
    <h2>1. Introduction</h2>
    <p>Nyxora ("we", "our", or "us") is a self-hosted, local-first automation software. This Privacy Policy explains how your information is handled when you use the Nyxora software and its Google Workspace integrations.</p>

    <h2>2. Local-First Data Processing</h2>
    <p>Nyxora is designed with absolute privacy in mind. Unlike traditional cloud services, <strong>Nyxora does not operate a centralized backend server that collects your data.</strong> All data fetched from your connected Google accounts (including Gmail, Google Drive, and Google Sheets) is processed and stored strictly on your local machine.</p>

    <h2>3. Google Workspace APIs Usage</h2>
    <p>Nyxora's use and transfer of information received from Google APIs to any other app will adhere to <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank">Google API Services User Data Policy</a>, including the Limited Use requirements.</p>
    <ul>
      <li><strong>What we access:</strong> We access your emails (<code>gmail.readonly</code>) and spreadsheets (<code>spreadsheets</code>, <code>drive.file</code>) solely to perform automations you explicitly request (e.g., summarizing emails or logging data to sheets).</li>
      <li><strong>What we store:</strong> OAuth tokens are stored locally on your device in secure encrypted vaults. We do not store your data on any external servers.</li>
      <li><strong>Third-Party Sharing:</strong> We <strong>do not</strong> share, sell, or transmit your Google user data to any third-party services, advertisers, or external LLM training databases.</li>
    </ul>

    <h2>4. Data Retention and Deletion</h2>
    <p>Because your data is stored locally on your own hardware, you maintain 100% control over it. You can delete all your data, including Google OAuth tokens, at any time by running the <code>nyxora clear --force</code> command or by deleting the <code>~/.nyxora</code> directory on your device.</p>

    <h2>5. Contact Us</h2>
    <p>If you have any questions regarding this Privacy Policy, please refer to the <a href="https://github.com/perasyudha/Nyxora">Nyxora GitHub Repository</a>.</p>
  </div>
</body>
</html>
  `;
}

export function generateTosHtml(): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nyxora Local Agent - Terms of Service</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #eceff4; background-color: #2e3440; max-width: 800px; margin: 0 auto; padding: 40px 20px; }
    h1, h2 { color: #88c0d0; }
    a { color: #81a1c1; text-decoration: none; }
    .container { background-color: #3b4252; padding: 32px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
  </style>
</head>
<body>
  <div class="container">
    <h1>Terms of Service for Nyxora Local Agent</h1>
    <p><em>Last Updated: June 2026</em></p>

    <h2>1. Acceptance of Terms</h2>
    <p>By downloading, installing, and using the Nyxora software, you agree to be bound by these Terms of Service. If you do not agree to these terms, do not use the software.</p>

    <h2>2. Nature of the Software (Self-Hosted)</h2>
    <p>Nyxora is provided as a self-hosted, local-first software application. You are solely responsible for the hardware, environment, and security of the device where Nyxora is installed.</p>

    <h2>3. Google Workspace Integrations</h2>
    <p>Nyxora allows you to connect your personal Google Workspace accounts to automate tasks. By utilizing these features, you authorize your local instance of Nyxora to access your data. You acknowledge that Nyxora does not control Google's services and is not liable for any changes, outages, or data loss occurring on Google's end.</p>

    <h2>4. Limitation of Liability</h2>
    <p>Nyxora is provided "AS IS" without any warranties of any kind. Under no circumstances shall the creators of Nyxora be liable for any direct, indirect, incidental, or consequential damages (including but not limited to financial losses, data loss, or unauthorized access) arising from your use of the software.</p>

    <h2>5. User Responsibilities</h2>
    <p>You are strictly responsible for maintaining the security of your local machine, your private keys, and your API credentials. You agree not to use Nyxora for any illegal activities or to violate the terms of service of any integrated third-party platforms.</p>
  </div>
</body>
</html>
  `;
}
