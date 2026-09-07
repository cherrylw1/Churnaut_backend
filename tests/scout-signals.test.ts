import { describe, expect, it } from 'vitest';
import { mapEntrySource } from '@/lib/scout/universal';

describe('Scout traffic source classification', () => {
  it.each(['google_ad', 'meta_ad', 'tiktok_ad', 'linkedin_ad', 'linkedin_lead_gen'])('maps %s to ad', (signal) => {
    expect(mapEntrySource(signal)).toBe('ad');
  });
  it.each(['g2_referral', 'partner_referral'])('maps %s to referral', (signal) => expect(mapEntrySource(signal)).toBe('referral'));
  it.each(['cold_email', 'Cold Email', 'crm_webhook'])('maps %s to outreach', (signal) => expect(mapEntrySource(signal)).toBe('outreach_tool'));
  it.each(['direct', 'returning_visitor', null])('does not misclassify %s as outreach', (signal) => expect(mapEntrySource(signal)).toBe('unknown'));
  it('keeps unknown source names unknown', () => expect(mapEntrySource('mystery_provider')).toBe('unknown'));
});
