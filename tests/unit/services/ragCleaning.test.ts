import { cleanEmailText } from '@/services/rag/ragCleaning';

describe('ragCleaning.cleanEmailText', () => {
  it('strips quoted replies and signatures while keeping identifiers', () => {
    const input = `
Hi team,

Order 100234 is delayed due to a carrier exception.

Thanks,
John Doe
--
John Doe | Alliance Chemical

On Mon, Jan 1, 2024 at 9:00 AM Support <support@example.com> wrote:
> Previous message line 1
> Previous message line 2
`;

    const cleaned = cleanEmailText(input);

    expect(cleaned).toContain('Order 100234 is delayed');
    expect(cleaned).not.toContain('On Mon, Jan 1');
    expect(cleaned).not.toContain('Previous message line 1');
    expect(cleaned.toLowerCase()).not.toContain('thanks');
  });

  it('removes nested replies and legal footers without dropping identifiers', () => {
    const input = `
Hi,

Tracking 1Z999AA123456789 should update tonight. SKU ABC-123 is confirmed.

Best,
Alex

-----Original Message-----
From: Support <support@example.com>
Sent: Tuesday, January 2, 2024 9:15 AM
To: Alex <alex@customer.com>
Subject: Re: Shipment update

> On Mon, Jan 1, 2024 at 8:00 AM Ops <ops@example.com> wrote:
> Please confirm the tracking status.

Confidentiality Notice
This email and any attachments are confidential and intended only for the recipient.
`;

    const cleaned = cleanEmailText(input);

    expect(cleaned).toContain('Tracking 1Z999AA123456789');
    expect(cleaned).toContain('SKU ABC-123');
    expect(cleaned).not.toContain('Original Message');
    expect(cleaned).not.toContain('Confidentiality Notice');
    expect(cleaned).not.toContain('This email and any attachments');
  });

  it('filters auto-reply noise while keeping core message', () => {
    const input = `
Out of office reply
I am currently out of the office.

Order 55555 will be delayed until Monday.

Sent from my iPhone
`;

    const cleaned = cleanEmailText(input);
    expect(cleaned).toContain('Order 55555 will be delayed');
    expect(cleaned).not.toContain('out of the office');
  });
});
