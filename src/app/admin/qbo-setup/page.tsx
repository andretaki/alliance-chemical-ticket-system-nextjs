import React from 'react';

export default function QBOSetupPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">QuickBooks Online Integration Setup</h1>
        
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-8">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">Integration Not Configured</h3>
              <div className="mt-2 text-sm text-yellow-700">
                QuickBooks Online integration requires setup of OAuth credentials and environment variables.
              </div>
            </div>
          </div>
        </div>

        {/* Step 1 */}
        <div className="bg-white shadow rounded-lg mb-6">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Step 1: Create QuickBooks App</h2>
          </div>
          <div className="px-6 py-4">
            <ol className="list-decimal list-inside space-y-3">
              <li>Go to <a href="https://developer.intuit.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Intuit Developer Portal</a></li>
              <li>Sign in with your Intuit account</li>
              <li>Click &quot;Create an App&quot; and select &quot;QuickBooks Online and Payments&quot;</li>
              <li>Fill in your app details:
                <ul className="list-disc list-inside ml-6 mt-2 space-y-1">
                  <li><strong>App Name:</strong> Alliance Chemical Ticket System</li>
                  <li><strong>Description:</strong> Integration for creating estimates and managing customers</li>
                  <li><strong>Redirect URI:</strong> <code className="bg-gray-100 px-2 py-1 rounded">https://your-domain.com/api/qbo/auth/callback</code></li>
                </ul>
              </li>
              <li>Select the following scopes:
                <ul className="list-disc list-inside ml-6 mt-2 space-y-1">
                  <li>com.intuit.quickbooks.accounting</li>
                </ul>
              </li>
            </ol>
          </div>
        </div>

        {/* Step 2 */}
        <div className="bg-white shadow rounded-lg mb-6">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Step 2: Get OAuth Credentials</h2>
          </div>
          <div className="px-6 py-4">
            <p className="mb-4">After creating your app, you&apos;ll receive:</p>
            <ul className="list-disc list-inside space-y-2">
              <li><strong>Client ID (Consumer Key)</strong></li>
              <li><strong>Client Secret (Consumer Secret)</strong></li>
            </ul>
            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">
                <strong>Note:</strong> Keep these credentials secure and never commit them to version control.
              </p>
            </div>
          </div>
        </div>

        {/* Step 3 */}
        <div className="bg-white shadow rounded-lg mb-6">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Step 3: Authorize Your App</h2>
          </div>
          <div className="px-6 py-4">
            <ol className="list-decimal list-inside space-y-3">
              <li>Use the QuickBooks OAuth flow to authorize your app</li>
              <li>This will generate:
                <ul className="list-disc list-inside ml-6 mt-2 space-y-1">
                  <li><strong>Access Token</strong></li>
                  <li><strong>Access Token Secret</strong></li>
                  <li><strong>Company/Realm ID</strong></li>
                </ul>
              </li>
              <li>These tokens are required for API calls</li>
            </ol>
            
            <div className="mt-4 p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-700">
                <strong>Tip:</strong> You can use the QB OAuth Playground or implement the OAuth flow in your application.
              </p>
            </div>
          </div>
        </div>

        {/* Step 4 */}
        <div className="bg-white shadow rounded-lg mb-6">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Step 4: Configure Environment Variables</h2>
          </div>
          <div className="px-6 py-4">
            <p className="mb-4">Add the following environment variables to your <code className="bg-gray-100 px-2 py-1 rounded">.env.local</code> file:</p>
            
            <div className="bg-gray-900 text-gray-100 p-4 rounded-lg font-mono text-sm overflow-x-auto">
              <pre>{`# QuickBooks Online Integration
QBO_CONSUMER_KEY=your_client_id_here
QBO_CONSUMER_SECRET=your_client_secret_here
QBO_ACCESS_TOKEN=your_access_token_here
QBO_ACCESS_TOKEN_SECRET=your_access_token_secret_here
QBO_REALM_ID=your_company_realm_id_here`}</pre>
            </div>
            
            <div className="mt-4 p-4 bg-red-50 rounded-lg">
              <p className="text-sm text-red-700">
                <strong>Security:</strong> Never commit these credentials to version control. Add .env.local to your .gitignore file.
              </p>
            </div>
          </div>
        </div>

        {/* Step 5 */}
        <div className="bg-white shadow rounded-lg mb-6">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Step 5: Test Integration</h2>
          </div>
          <div className="px-6 py-4">
            <p className="mb-4">After configuring the environment variables:</p>
            <ol className="list-decimal list-inside space-y-3">
              <li>Restart your development server</li>
              <li>Go to the Direct Quote Creator</li>
              <li>Try creating a QuickBooks estimate</li>
              <li>Check the server logs for any errors</li>
            </ol>
          </div>
        </div>

        {/* Current Status */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Current Status</h2>
          </div>
          <div className="px-6 py-4">
            <div className="space-y-2">
              <div className="flex items-center">
                <span className="w-4 h-4 bg-red-500 rounded-full mr-3"></span>
                <span>QBO_CONSUMER_KEY: Not configured</span>
              </div>
              <div className="flex items-center">
                <span className="w-4 h-4 bg-red-500 rounded-full mr-3"></span>
                <span>QBO_CONSUMER_SECRET: Not configured</span>
              </div>
              <div className="flex items-center">
                <span className="w-4 h-4 bg-red-500 rounded-full mr-3"></span>
                <span>QBO_ACCESS_TOKEN: Not configured</span>
              </div>
              <div className="flex items-center">
                <span className="w-4 h-4 bg-red-500 rounded-full mr-3"></span>
                <span>QBO_ACCESS_TOKEN_SECRET: Not configured</span>
              </div>
              <div className="flex items-center">
                <span className="w-4 h-4 bg-red-500 rounded-full mr-3"></span>
                <span>QBO_REALM_ID: Not configured</span>
              </div>
            </div>
          </div>
        </div>

        {/* Help */}
        <div className="mt-8 bg-gray-50 rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Need Help?</h3>
          <div className="space-y-2">
            <p><strong>Documentation:</strong> <a href="https://developer.intuit.com/app/developer/qbo/docs/get-started" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">QuickBooks Online API Docs</a></p>
            <p><strong>OAuth Guide:</strong> <a href="https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">OAuth 2.0 Guide</a></p>
            <p><strong>API Explorer:</strong> <a href="https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/account" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Test API Calls</a></p>
          </div>
        </div>
      </div>
    </div>
  );
}