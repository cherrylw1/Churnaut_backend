export interface Client {
  id: string;
  created_at: string;
  company_name: string;
  domain: string;
  plan: string;
  snippet_key: string;
  crm_type?: string;
  crm_api_key?: string;
  calendly_token?: string;
  stripe_customer_id?: string;
  active: boolean;
}

export interface Session {
  id: string;
  client_id: string;
  created_at: string;
  expires_at?: string;
  prospect_name?: string;
  prospect_email?: string;
  company_name?: string;
  job_title?: string;
  signal_type?: string;
  assigned_rep?: string;
  calendar_url?: string;
  crm_deal_id?: string;
  deal_stage?: string | null;
  visitor_type?: string | null;
  clicked_at?: string;
  click_count: number;
  converted: boolean;
  converted_at?: string;
  visitor_token?: string;
  metadata?: {
    utms?: {
      utm_source?: string | null;
      utm_medium?: string | null;
      utm_campaign?: string | null;
      utm_content?: string | null;
      utm_term?: string | null;
    };
    [key: string]: unknown;
  };
}

export interface RuleCondition {
  field: keyof Session | string;
  operator: 'equals' | 'not_equals' | 'contains' | 'starts_with' | 'ends_with' | 'is_empty' | 'is_not_empty';
  value?: string;
}

export interface RoutingRule {
  id: string;
  client_id: string;
  priority: number;
  active: boolean;
  signal_type?: string;
  conditions: RuleCondition[] | { rules: RuleCondition[] } | any;
  action_type: 'show_calendar' | 'inject_copy' | string;
  action_payload: {
    selector?: string;
    swaps?: { selector: string; content: string }[];
    [key: string]: any;
  };
  target_selector?: string;
  variant_content?: string;
  created_at: string;
  updated_at: string;
}

export interface Swap {
  selector: string;
  content: string;
}

export interface ResolveResponse {
  visitor_token?: string;
  swaps: Swap[];
}
