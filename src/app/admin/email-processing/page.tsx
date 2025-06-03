// src/app/admin/email-processing/page.tsx
import { Metadata } from 'next';
import EmailProcessingButton from '@/components/EmailProcessingButton';

export const metadata: Metadata = {
  title: 'Email Processing - Issue Tracker',
  description: 'Process emails to create tickets',
};

export default function EmailProcessingPage() {
  return (
    <div className="container py-4">
      <div className="row">
        <div className="col-12">
          <h1 className="mb-4">Email Processing</h1>
          
          <div className="row">
            <div className="col-lg-8">
              <EmailProcessingButton />
              
              <div className="card shadow-sm mb-4">
                <div className="card-header bg-light">
                  <h3 className="mb-0 h5">About Email Processing</h3>
                </div>
                <div className="card-body">
                  <h5>How it works</h5>
                  <p>
                    The email processing system connects to your Microsoft 365 shared mailbox 
                    to process unread emails and convert them into tickets automatically.
                  </p>
                  
                  <h5>Process</h5>
                  <ol>
                    <li>Unread emails are fetched from your inbox</li>
                    <li>For each email, a new ticket is created with:
                      <ul>
                        <li>The email subject as the ticket title</li>
                        <li>The email body as the ticket description</li>
                        <li>The sender is registered as a user in the system</li>
                        {/* Removed line about project assignment */}
                      </ul>
                    </li>
                    <li>Processed emails are marked as read and moved to a &ldquo;Processed&rdquo; folder</li>
                    <li>Emails that fail processing are moved to an &ldquo;Error&rdquo; folder</li>
                  </ol>
                  
                  <h5>Configuration</h5>
                  <p>
                    The email processing system needs the following Mail folders to exist:
                  </p>
                  <ul>
                    <li><strong>Processed</strong> - For successfully processed emails</li>
                    <li><strong>Error</strong> - For emails that failed processing</li>
                  </ul>
                  <p>
                    These folders will be created automatically if they don&apos;t exist.
                  </p>
                </div>
              </div>
            </div>
            
            <div className="col-lg-4">
              <div className="card shadow-sm mb-4">
                <div className="card-header bg-light">
                  <h3 className="mb-0 h5">Automation Options</h3>
                </div>
                <div className="card-body">
                  <p>
                    For automatic processing, consider setting up one of these options:
                  </p>
                  
                  <h6>Option 1: Scheduled API Calls</h6>
                  <p>
                    Set up a service like Azure Functions, AWS Lambda, or GitHub Actions to call
                    the <code>/api/process-emails</code> endpoint (as a POST request) at regular intervals.
                    You <strong>must</strong> include the <code>X-API-Key</code> header with the value set in your
                    <code>EMAIL_PROCESSING_SECRET_KEY</code> environment variable.
                  </p>
                  
                  <h6>Option 2: Power Automate</h6>
                  <p>
                    Use Microsoft Power Automate (Flow) to trigger the API endpoint whenever a new email arrives.
                  </p>
                  
                  <div className="alert alert-warning">
                    <strong>Security Note:</strong> The email processing endpoint is protected by a secret key.
                    Ensure the <code>X-API-Key</code> header is sent with the correct value for automated calls.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}